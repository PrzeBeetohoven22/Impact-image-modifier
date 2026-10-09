import sharp from "sharp";
export const face = { x: 175, y: 50, width: 150, height: 160 };
export async function subjectFixture() {
  return sharp(
    Buffer.from(
      '<svg width="500" height="700"><rect x="175" y="40" width="150" height="180" fill="#b89478"/><rect x="90" y="220" width="320" height="460" fill="#273b65"/></svg>',
    ),
  )
    .png()
    .toBuffer();
}
export async function gradientFixture() {
  return sharp({
    create: {
      width: 1600,
      height: 1200,
      channels: 3,
      background: { r: 230, g: 30, b: 90 },
    },
  })
    .png()
    .toBuffer();
}
