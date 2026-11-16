import { readFile, mkdir, writeFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const images = JSON.parse(await readFile(new URL("data/article-images.json", root), "utf8"));
const directory = new URL("assets/images/articles/", root);
await mkdir(directory, { recursive: true });
for (const image of images) {
  const response = await fetch(image.url);
  if (!response.ok) throw new Error(`${image.name}: HTTP ${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") {
    throw new Error(`${image.name}: expected a PNG image`);
  }
  await writeFile(new URL(`${image.name}.png`, directory), buffer);
  console.log(`Saved ${image.name}: ${buffer.readUInt32BE(16)}x${buffer.readUInt32BE(20)}`);
}
