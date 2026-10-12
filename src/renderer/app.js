/* Host page: loads character.json and its images, then shows the idle rig. */
(async function () {
  const BASE = 'character/assets/';
  const status = document.getElementById('status');
  const canvas = document.getElementById('stage');
  const ctx = canvas.getContext('2d');

  const loadImage = (file) => new Promise((resolve, reject) => {
    const im = new Image();
    im.onload = () => resolve([file, im]);
    im.onerror = () => reject(new Error('Could not load ' + file));
    im.src = BASE + file;
  });

  try {
    const char = await (await fetch(BASE + 'character.json')).json();
    const files = new Set([...Object.values(char.rig.layers), ...Object.values(char.rig.overlays)]);
    Object.values(char.poses).forEach(p => { if (!p.legacy) files.add(p.file); });   // the turn ring uses the same files
    const images = Object.fromEntries(await Promise.all([...files].map(loadImage)));

    const tokku = new TokkuCharacter(char, images);
    tokku.x = canvas.width / 2; tokku.groundY = canvas.height - 40;
    status.textContent = 'Tokku is running (' + files.size + ' images loaded).';

    let last = performance.now();
    const frame = (now) => {
      tokku.update((now - last) / 1000); last = now;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      tokku.draw(ctx);
      requestAnimationFrame(frame);
    };
    frame(last);   // draw once right away, even if the window is still hidden
  } catch (err) {
    status.textContent = 'Error: ' + err.message;
  }
})();
