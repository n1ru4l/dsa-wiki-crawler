import puppeteer from "puppeteer";
import Turndown = require("turndown");
import * as fs from "fs";
import * as path from "path";
import * as prettier from "prettier";
import sanitizeHtml from "sanitize-html";

const turndownPluginGfm = require("turndown-plugin-gfm");
const tables = turndownPluginGfm.tables;

const ID_PREFIX = "dsa-rule-";
const OUTPUT_DIRECTORY = "result";
const PREFIX = "https://ulisses-regelwiki.de/";
const ENTRY_POINTS = [
  "index.php/regeln.html",
  "index.php/spezies.html",
  "index.php/kulturen.html",
  "index.php/professionen.html",
  "index.php/sonderfertigkeiten.html",
  "index.php/vor-und-nachteile.html",
  "index.php/magie.html",
  "index.php/goetterwirken.html",
  "index.php/ruestkammer.html",
  "index.php/bestiarium.html",
  "index.php/herbarium.html",
  "index.php/GifteundKrankheiten.html",
  "index.php/WdV18.html",
];

const parseMarkdown = (input: string): string => {
  const s = new Turndown({ linkReferenceStyle: "shortcut" })
    .remove("title")
    .remove("style");
  s.use([tables]);
  return s.turndown(input);
};

const alreadyParsedIds = new Set<string>();

const normalizeLink = (link: string) =>
  link
    .replace("https://ulisses-regelwiki.de/", "")
    .replace("http://ulisses-regelwiki.de/", "");

const parseLinks = (text: string) => {
  const regexMdLinks = /\[([^\[]+)\](\([^[\[\])]*\))/gm;
  const results = [] as { text: string; wholeLink: string; link: string }[];
  const matches = text.match(regexMdLinks);
  const singleMatch = /\[([^\[]+)\]\((.*)\)/;
  if (!matches) return results;
  for (let i = 0; i < matches.length; i++) {
    const [, text, link] = singleMatch.exec(matches[i]);
    results.push({
      text,
      wholeLink: link,
      link: normalizeLink(link),
    });
  }
  return results;
};

const convertLinkToId = (linkTarget: string) => {
  const subject = normalizeLink(linkTarget).split("/");
  return subject.pop().replace(".html", "");
};

const sanitizeTitle = (title: string) => title.replace(" - DSA Regel Wiki", "");

const parseSite = async (page: puppeteer.Page, link: string) => {
  await page.goto(PREFIX + link);
  const content = await page.evaluate(() => {
    return {
      id: document.location.pathname,
      title: document.title,
      contentCenter: document.querySelector("center")?.innerHTML ?? "",
      contentMain: document.querySelector("#main")?.innerHTML ?? "",
    };
  });

  const id = convertLinkToId(decodeURIComponent(content.id));
  const title = sanitizeTitle(content.title);

  const markdown = parseMarkdown(
    sanitizeHtml(`${content.contentCenter}\n\n${content.contentMain}`, {
      allowedTags: [...sanitizeHtml.defaults.allowedTags, "h1", "h2"],
      allowedAttributes: {
        "*": ["href", "align", "alt", "center", "bgcolor"],
      },
    })
  ).trim();

  const links = parseLinks(markdown);

  let normalizedMarkdown = markdown;
  let i = 0;
  for (const link of links) {
    i = i + 1;
    normalizedMarkdown = normalizedMarkdown.replace(
      `[${link.text}](${link.wholeLink})`,
      `[${link.text}](${ID_PREFIX}${convertLinkToId(link.link)})`
    );
  }

  const fsId = `${ID_PREFIX}${id}`;

  fs.writeFileSync(
    path.join(OUTPUT_DIRECTORY, `${fsId}.md`),
    `<!-- ${title} -->\n\n` +
      prettier.format(normalizedMarkdown, { filepath: "foo.md" })
  );

  alreadyParsedIds.add(link);

  return links;
};

type PromiseValue<T> = T extends Promise<infer I> ? I : never;

const main = async () => {
  const browser = await puppeteer.launch({ args: ["--no-sandbox"] });
  const page = await browser.newPage();

  const links = [] as PromiseValue<ReturnType<typeof parseSite>>;

  for (const entryPointLink of ENTRY_POINTS) {
    links.push(...(await parseSite(page, entryPointLink)));
  }

  let i = -1;

  do {
    i = i + 1;
    const link = links[i];
    if (!link) break;
    if (alreadyParsedIds.has(link.link)) continue;
    console.log(i, link.link);
    const newLinks = await parseSite(page, link.link);
    links.push(...newLinks);
  } while (true);

  await browser.close();
};

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
