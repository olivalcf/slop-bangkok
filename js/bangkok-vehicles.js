import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { BODY_SPECS, buildCarGeometry, createLoftedCarMaterial } from './actor-models.js';

const paint = color => new THREE.MeshStandardNodeMaterial({ color, roughness: 0.4, metalness: 0.25 });
const rubber = paint(0x252d2b), silver = paint(0xa4b0ab), seat = paint(0x3a4038), skin = paint(0xb68e6b);
const scooterPaint = [paint(0xb34342), paint(0x375f79), paint(0xd3d2b4), paint(0x527258)];
let taxiGeometry, sedanGeometry;
function smallVehicle(index, tukTuk) {
  const parts = new Map(), group = new THREE.Group();
  const add = (geometry, material) => { if (!parts.has(material)) parts.set(material, []); parts.get(material).push(geometry); };
  const box = (x,y,z,w,h,d,m) => add(new THREE.BoxGeometry(w,h,d).translate(x,y,z),m);
  const wheel = (x,z,r=0.27) => {
    add(new THREE.CylinderGeometry(r,r,0.12,12).rotateZ(Math.PI/2).translate(x,r,z),rubber);
    add(new THREE.CylinderGeometry(r*0.58,r*0.58,0.13,10).rotateZ(Math.PI/2).translate(x,r,z),silver);
  };
  const color = scooterPaint[index % 4];
  if (tukTuk) {
    group.name = 'Bangkok tuk-tuk';
    wheel(0,0.9,0.3); wheel(-0.58,-0.65,0.3); wheel(0.58,-0.65,0.3);
    box(0,0.58,-0.28,1.32,0.3,1.65,color); box(0,0.88,-0.85,1.35,0.55,0.14,color);
    box(0,0.92,-0.48,1.12,0.18,0.65,seat); box(0,1.18,-0.73,1.12,0.55,0.13,seat);
    box(0,1.9,-0.28,1.5,0.12,1.95,color);
    for (const side of [-1,1]) for (const z of [-1.1,0.53]) box(side*0.67,1.35,z,0.045,1.1,0.045,silver);
    box(0,0.92,0.7,0.68,0.75,0.28,color); box(0,1.35,0.67,0.58,0.09,0.04,silver);
    for (const side of [-1,1]) add(new THREE.SphereGeometry(0.12,8,6).translate(side*0.24,0.95,0.89),silver);
  } else {
    group.name = 'Bangkok scooter';
    wheel(0,0.68); wheel(0,-0.66);
    box(0,0.47,-0.12,0.42,0.34,1.0,color); box(0,0.75,-0.3,0.45,0.12,0.75,seat);
    box(0,0.7,0.48,0.46,0.65,0.14,color); box(0,1.09,0.51,0.6,0.06,0.07,silver);
    box(0,1.0,0.59,0.25,0.16,0.05,silver);
    // Seated rider, bent legs and arms, helmet and a small delivery carrier.
    const shirt = scooterPaint[(index + 1) % 4];
    add(new THREE.CapsuleGeometry(0.19,0.37,3,6).rotateX(0.18).translate(0,1.14,-0.18),shirt);
    add(new THREE.SphereGeometry(0.17,8,6).translate(0,1.62,-0.06),skin);
    add(new THREE.SphereGeometry(0.19,8,6,0,Math.PI*2,0,Math.PI*0.65).translate(0,1.66,-0.06),color);
    for (const side of [-1,1]) {
      add(new THREE.CapsuleGeometry(0.065,0.44,2,5).rotateX(0.9).translate(side*0.22,1.1,0.15),shirt);
      add(new THREE.CapsuleGeometry(0.08,0.4,2,5).rotateX(-0.6).translate(side*0.23,0.58,-0.03),seat);
    }
    if (index % 3 === 0) box(0,1.0,-0.73,0.5,0.45,0.5,color);
  }
  for (const [material, list] of parts) {
    const geometry = mergeGeometries(list); for (const g of list) g.dispose();
    const mesh = new THREE.Mesh(geometry,material); mesh.castShadow = true; group.add(mesh);
  }
  return group;
}

export function createBangkokTrafficVehicle(index) {
  if (index % 13 === 0) return smallVehicle(index,true);
  if (index % 3 === 0) return smallVehicle(index,false);
  taxiGeometry ||= buildCarGeometry(BODY_SPECS.taxi);
  sedanGeometry ||= buildCarGeometry(BODY_SPECS.sedan);
  const group = new THREE.Group(), taxi = index % 4 < 2;
  const base = index % 2 ? 0x16864f : 0xdd3c8b;
  const colors = [0xd0d4cc,0x7f8a8b,0x3a4752,0xe1ded2];
  const material = taxi ? createLoftedCarMaterial(BODY_SPECS.taxi,base,0xe6c437) : createLoftedCarMaterial(BODY_SPECS.sedan,colors[index%4]);
  const mesh = new THREE.Mesh(taxi ? taxiGeometry : sedanGeometry,material);
  mesh.castShadow = true; mesh.receiveShadow = true; group.add(mesh);
  group.name = taxi ? 'Bangkok two-tone meter taxi' : 'Traffic sedan';
  return group;
}
