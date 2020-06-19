# Crawler Code For DSA Wiki

Create a offline copy of the DSA Wiki in Markdown.

## Why

- The Wiki has bad performance.
- You might not have internet connection anywhere.

## How

```bash
docker build -t dsa-wiki-crawler .
docker run -v "$PWD/result:/srv/app/result" dsa-wiki-crawler
```
