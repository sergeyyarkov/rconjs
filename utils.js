export async function wait(ms = 1000, cb = () => undefined) {
  return new Promise((resolve) => {
    setTimeout(() => {
      cb();
      resolve();
    }, ms);
  });
}
