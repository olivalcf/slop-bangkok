import * as THREE from 'three/webgpu';
import { Fn, attribute, normalGeometry, positionGeometry, positionWorld, vec2, color, mix, fract, floor, step, abs, sin, texture } from 'three/tsl';

// One bay per atlas column. The upper half is a repeatable residential floor;
// the lower half is a street-level shutter or shop. Physical balconies and
// awnings are added separately along the featured Bangkok streets.
export function createShophouseMaterial() {
  const canvas = document.createElement('canvas'); canvas.width = 2048; canvas.height = 512;
  const c = canvas.getContext('2d');
  const palette = ['#c9bd9b', '#a8b9a6', '#d4c5b5', '#c8b783', '#b9bab4', '#d3b7aa', '#a6b9b9', '#d8d0ba'];
  for (let style = 0; style < 8; style++) {
    const x = style * 256;
    c.fillStyle = palette[style]; c.fillRect(x, 0, 256, 512);
    // Painted concrete and rain streaks, without masonry courses.
    for (let i = 0; i < 90; i++) {
      const px = x + ((i * 73 + style * 19) % 256), py = (i * 43) % 512;
      c.fillStyle = `rgba(57,59,48,${0.015 + (i % 5) * 0.008})`;
      c.fillRect(px, py, 2 + i % 6, 20 + i % 45);
    }
    c.fillStyle = '#d7d4bf'; c.fillRect(x, 235, 256, 15);
    c.fillStyle = '#888e83'; c.fillRect(x, 250, 256, 6);
    // Aluminium sliders with blue-grey glass and a deeply shaded lintel.
    c.fillStyle = '#626d68'; c.fillRect(x + 28, 38, 200, 156);
    c.fillStyle = '#c0c6bd'; c.fillRect(x + 32, 42, 192, 146);
    c.fillStyle = style % 3 === 0 ? '#314d4b' : '#446168'; c.fillRect(x + 38, 48, 180, 134);
    c.fillStyle = '#9aa89d'; c.fillRect(x + 124, 48, 6, 134); c.fillRect(x + 38, 112, 180, 5);
    c.fillStyle = '#c3c7b1'; c.fillRect(x + 25, 190, 206, 8);
    c.fillStyle = 'rgba(26,40,37,.25)'; c.fillRect(x + 28, 198, 200, 9);
    // Security bars are common on the upper floors as well as the ground floor.
    c.fillStyle = '#535f57'; for (let bar = 0; bar < 7; bar++) c.fillRect(x + 44 + bar * 27, 51, 2, 130);
    c.fillStyle = '#908e80'; c.fillRect(x + 12, 279, 232, 220);
    c.fillStyle = style % 3 === 0 ? '#3a5550' : '#aaa99a'; c.fillRect(x + 19, 288, 218, 208);
    if (style % 3 === 0) {
      c.fillStyle = '#253d38'; c.fillRect(x + 28, 320, 200, 174);
      c.fillStyle = '#b8b19a'; c.fillRect(x + 118, 320, 5, 174);
    } else {
      for (let y = 290; y < 496; y += 6) {
        c.fillStyle = '#737c73'; c.fillRect(x + 20, y, 216, 1);
        c.fillStyle = '#c2c1af'; c.fillRect(x + 20, y + 1, 216, 1);
      }
    }
    c.fillStyle = '#777c6d'; c.fillRect(x + 4, 279, 9, 233); c.fillRect(x + 244, 279, 9, 233);
  }
  const atlas = new THREE.CanvasTexture(canvas); atlas.colorSpace = THREE.SRGBColorSpace;
  atlas.anisotropy = 4;
  const material = new THREE.MeshStandardNodeMaterial({ roughness: 0.88, metalness: 0.015 });
  material.colorNode = Fn(() => {
    const box = attribute('box', 'vec4');
    const side = step(0.5, abs(normalGeometry.x));
    const across = mix(positionGeometry.x, positionGeometry.z, side).add(0.5).mul(mix(box.x, box.z, side));
    const height = positionGeometry.y.add(0.5).mul(box.y);
    const style = floor(fract(box.w.mul(0.173)).mul(8));
    const u = fract(across.div(4.1)).mul(0.992).add(0.004).add(style).div(8);
    const upper = step(3.4, height);
    const v = mix(height.div(3.4).mul(0.49), fract(height.sub(3.4).div(3.3)).mul(0.49).add(0.505), upper);
    const wall = texture(atlas, vec2(u, v)).rgb;
    const roof = color(0xa6a899).mul(sin(positionWorld.x.mul(0.35)).mul(0.035).add(0.94));
    return mix(wall, roof, step(0.5, abs(normalGeometry.y)));
  })();
  return material;
}

export function createBangkokRoadMaterial() {
  const material = new THREE.MeshStandardNodeMaterial({ roughness: 0.94, metalness: 0 });
  material.colorNode = Fn(() => {
    const p = positionWorld.xz;
    const grain = fract(sin(p.x.mul(91.7).add(p.y.mul(137.2))).mul(43758.54));
    const patch = sin(p.x.mul(0.19).add(sin(p.y.mul(0.12))));
    return color(0x414746).mul(grain.mul(0.11).add(0.87).add(patch.mul(0.055)));
  })();
  return material;
}

export function createShopSignAtlas() {
  const canvas = document.createElement('canvas'); canvas.width = 2048; canvas.height = 1024;
  const c = canvas.getContext('2d');
  const shops = [
    ['ร้านอาหาร', 'THAI FOOD', '#28594b', '#f7ebc7'], ['ก๋วยเตี๋ยว', 'NOODLES', '#9c302c', '#f6dc91'],
    ['กาแฟ', 'COFFEE', '#e1c898', '#3f4b3f'], ['ขายยา', 'PHARMACY', '#e8e6c9', '#27775e'],
    ['ซักรีด', 'LAUNDRY', '#e5dfc7', '#346d7b'], ['อาหารตามสั่ง', 'MADE TO ORDER', '#243f57', '#eee7d0'],
    ['นวดแผนไทย', 'THAI MASSAGE', '#684c44', '#e7cf96'], ['ร้านสะดวกซื้อ', 'MINI MART', '#eff0d5', '#26724f'],
    ['เยาวราช', 'YAOWARAT', '#a52c25', '#f4d279'], ['ห้างทอง', 'GOLD SHOP', '#9c2424', '#ffe193'],
    ['ผลไม้สด', 'FRESH FRUIT', '#46734d', '#f4e8bb'], ['ข้าวมันไก่', 'CHICKEN RICE', '#e4d5b3', '#a1342a'],
    ['อาหารเจ', 'VEGETARIAN', '#eac540', '#ad2e25'], ['ตัดผม', 'BARBER', '#324c5c', '#f0e9d2'],
    ['ขนมไทย', 'THAI SWEETS', '#d4b2a4', '#493e36'], ['สุวรรณ', 'GOLD & JEWELLERY', '#9d2423', '#f6d77c']
  ];
  for (let i = 0; i < shops.length; i++) {
    const [thai, english, bg, fg] = shops[i], x = i % 4 * 512, y = Math.floor(i / 4) * 256;
    c.fillStyle = bg; c.fillRect(x, y, 512, 256);
    c.strokeStyle = fg; c.lineWidth = 3; c.strokeRect(x + 9, y + 10, 494, 236);
    c.textAlign = 'center'; c.fillStyle = fg;
    c.font = '600 58px "Noto Sans Thai", sans-serif'; c.fillText(thai, x + 256, y + 116, 472);
    c.font = '600 25px "IBM Plex Sans", sans-serif'; c.fillText(english, x + 256, y + 174, 472);
  }
  const atlas = new THREE.CanvasTexture(canvas); atlas.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.MeshStandardNodeMaterial({ map: atlas, emissiveMap: atlas, emissive: 0xffffff, emissiveIntensity: 0.12, roughness: 0.65, side: THREE.DoubleSide });
  return { material, count: shops.length };
}
