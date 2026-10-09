process.on("disconnect", () => process.exit(0));
process.on("message", ({ id, image }) => {
  const command = image.toString();
  if (command === "crash") process.kill(process.pid, "SIGSEGV");
  else if (command !== "hang")
    process.send({ id, result: Buffer.from(String(process.pid)) });
});
