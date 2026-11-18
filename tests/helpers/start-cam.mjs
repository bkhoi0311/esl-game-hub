// Bấm "Bắt đầu" ở màn chọn camera; nếu game có màn "Khóa khung" (src/core/frame-lock-ui.js) thì bấm "Bỏ qua" để vào thẳng game.
export async function startCam(page) {
  await page.click('[data-testid=cam-start]');
  const skip = await page.waitForSelector('[data-testid=fl-skip]', { timeout: 700 }).catch(() => null);
  if (skip) await skip.click();
}
