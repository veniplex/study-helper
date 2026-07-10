import sharp from "sharp"
import { mkdir } from "node:fs/promises"

const svg = (size, padded) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100">
  <rect width="100" height="100" rx="${padded ? 0 : 22}" fill="#171717"/>
  <g transform="translate(50 52) scale(${padded ? 0.62 : 0.78})" stroke="#fafafa" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" fill="none">
    <path d="M-38 -10 L0 -28 L38 -10 L0 8 Z" fill="#fafafa" stroke="none"/>
    <path d="M-20 0 v16 c0 6 9 12 20 12 s20 -6 20 -12 v-16"/>
    <path d="M38 -10 v22"/>
  </g>
</svg>`

await mkdir("public/icons", { recursive: true })
await sharp(Buffer.from(svg(192, false))).resize(192, 192).png().toFile("public/icons/icon-192.png")
await sharp(Buffer.from(svg(512, false))).resize(512, 512).png().toFile("public/icons/icon-512.png")
await sharp(Buffer.from(svg(512, true))).resize(512, 512).png().toFile("public/icons/icon-512-maskable.png")
console.log("icons written")
