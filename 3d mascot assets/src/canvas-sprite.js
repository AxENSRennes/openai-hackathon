/** Dependency-free adapter for the existing Canvas/2D game.
 * `image` is the loaded <id>-atlas.png, `metadata` is <id>.json.
 * (x, y) is the on-screen feet position. elapsedSeconds is presentation time.
 * Caller chooses pose from authoritative engine activity/events.
 * Animated actions face one fixed 3/4 direction; they are not 8-direction animation sets.
 */
export function drawMascotSprite(context, image, metadata, {
  x, y, height = 120, pose = 'idle', elapsedSeconds = 0,
}) {
  const row = Math.max(0, metadata.rows.indexOf(pose));
  const duration = metadata.durationSecondsByPose[metadata.rows[row]];
  const frame = Math.floor(Math.max(0, elapsedSeconds) / duration * metadata.columns) % metadata.columns;
  const width = height * metadata.frameWidth / metadata.frameHeight;
  context.drawImage(
    image,
    frame * metadata.frameWidth, row * metadata.frameHeight,
    metadata.frameWidth, metadata.frameHeight,
    x - width * metadata.pivot.x, y - height * metadata.pivot.y,
    width, height,
  );
}
