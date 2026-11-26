// Modeleur CAO · Techno-Hangar
// Noyau : OpenCascade (replicad) · Esquisses : planegcs (solveur de FreeCAD) · Affichage : three.js
import * as THREE from 'three';
import {LineSegments2} from 'three/addons/lines/LineSegments2.js';
import {LineSegmentsGeometry} from 'three/addons/lines/LineSegmentsGeometry.js';
import {LineMaterial} from 'three/addons/lines/LineMaterial.js';
import opencascade from 'replicad-opencascadejs';
import * as R from 'replicad';
import {init_planegcs_module, GcsWrapper} from 'planegcs';

const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const nf = (x, d = 2) => Number.isFinite(x) ? x.toLocaleString('fr-FR', {minimumFractionDigits:d, maximumFractionDigits:d}) : '—';
const nfs = x => Number.isFinite(x) ? (+x.toFixed(3)).toLocaleString('fr-FR', {maximumFractionDigits:3}) : '—';
const LS = {get(k){try{return JSON.parse(localStorage.getItem(k))}catch(e){return null}}, set(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}}};
const V3 = a => new THREE.Vector3(a[0], a[1], a[2]);
const clone = o => JSON.parse(JSON.stringify(o));
const DEG = Math.PI/180;

// =====================================================================
// Données : la « recette » d'une pièce
// =====================================================================
const BASE = {
 face:   {label:'Plan de face',   o:[0,0,0], x:[1,0,0],  n:[0,0,1]},
 dessus: {label:'Plan de dessus', o:[0,0,0], x:[1,0,0],  n:[0,1,0]},
 droite: {label:'Plan de droite', o:[0,0,0], x:[0,0,-1], n:[1,0,0]}};
const TYPES = {
 sketch:  {nom:'Esquisse'},
 extrude: {nom:'Bossage-Extrusion'},
 cut:     {nom:'Enlèvement de matière-Extrusion'},
 revolve: {nom:'Bossage-Révolution'},
 rcut:    {nom:'Enlèvement de matière-Révolution'},
 fillet:  {nom:'Congé'},
 chamfer: {nom:'Chanfrein'},
 hole:    {nom:'Perçage'}};
const MATS = [['', 'Non spécifié', 0], ['sw', 'Densité par défaut de SolidWorks (eau)', 1000], ['acier', 'Acier (S235)', 7850], ['inox', 'Acier inoxydable', 7900], ['fonte', 'Fonte', 7200],
 ['alu', 'Alliage d’aluminium', 2700], ['laiton', 'Laiton', 8500], ['cuivre', 'Cuivre', 8960], ['abs', 'ABS', 1050], ['pla', 'PLA (impression 3D)', 1240], ['petg', 'PETG', 1270],
 ['pa', 'Polyamide (nylon)', 1140], ['pom', 'POM (Delrin)', 1410], ['bois', 'Bois (chêne)', 700]];

function newDoc(name = 'Pièce1'){return {format:'techno-hangar-cao', version:1, name, material:'', features:[], n:{}}}
function nextName(type){S.doc.n[type] = (S.doc.n[type] || 0) + 1; return TYPES[type].nom + S.doc.n[type]}
function newId(){return 'f' + Math.random().toString(36).slice(2, 8)}
const feat = id => S.doc.features.find(f => f.id === id);
const usesSketch = f => f.sketch ? [f.sketch] : [];
const consumers = sid => S.doc.features.filter(f => usesSketch(f).includes(sid));

function planeOf(sk){
 const p = sk.plane.base ? BASE[sk.plane.base] : sk.plane;
 const n = V3(p.n).normalize(), x = V3(p.x).normalize(), o = V3(p.o).addScaledVector(n, sk.plane.offset || 0);
 return {o, x, y:n.clone().cross(x), n, label: sk.plane.base ? BASE[sk.plane.base].label : (sk.plane.label || 'Face plane')};
}
const to3 = (pl, u, v) => pl.o.clone().addScaledVector(pl.x, u).addScaledVector(pl.y, v);
const to2 = (pl, P) => {const d = P.clone().sub(pl.o); return [d.dot(pl.x), d.dot(pl.y)]};
const rPlane = (pl, shift = 0) => new R.Plane(pl.o.clone().addScaledVector(pl.n, shift).toArray(), pl.x.toArray(), pl.n.toArray());

// =====================================================================
// État
// =====================================================================
const S = {doc:null, shape:null, res:{}, faces:[], edges:[], sel:null, face:null, tab:'fonctions', mode:'idle', pm:null, sk:null,
 undo:[], redo:[], stopAt:null, buildMs:0, showRel:true};
let oc = null, GCS = null;

// =====================================================================
// Scène three.js (même navigation que la visionneuse)
// =====================================================================
const vp = $('#vp');
const renderer = new THREE.WebGLRenderer({antialias:true, alpha:true, preserveDrawingBuffer:true});
renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.autoClear = false;
vp.appendChild(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -1000, 1000);
const target = new THREE.Vector3(); let frust = 60;
scene.add(new THREE.HemisphereLight(0xffffff, 0x8890a0, 1.6));
const key = new THREE.DirectionalLight(0xffffff, 1.6); camera.add(key); key.position.set(-0.6, 1, 1.2);
const fill = new THREE.DirectionalLight(0xffffff, 0.5); camera.add(fill); fill.position.set(1, -0.4, 0.6);
scene.add(camera);
const modelGroup = new THREE.Group(), planeGroup = new THREE.Group(), skGroup = new THREE.Group(), hlGroup = new THREE.Group(), freeGroup = new THREE.Group();
scene.add(modelGroup, planeGroup, skGroup, hlGroup, freeGroup);
const triScene = new THREE.Scene(), triCam = new THREE.OrthographicCamera(-1.6, 1.6, 1.6, -1.6, 0.1, 10);
function txtSprite(t, col, sz = .55){const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'); x.font = 'bold 44px Geist,sans-serif'; x.fillStyle = col; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(t, 32, 34); const s = new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(c), depthTest:false})); s.scale.set(sz, sz, 1); return s}
[[1,0,0,0xe5484d,'X'],[0,1,0,0x30a46c,'Y'],[0,0,1,0x3e63dd,'Z']].forEach(([x,y,z,c,t]) => {const d = new THREE.Vector3(x,y,z); triScene.add(new THREE.ArrowHelper(d, new THREE.Vector3(), 1, c, .28, .16)); const l = txtSprite(t, '#'+c.toString(16).padStart(6,'0')); l.position.copy(d).multiplyScalar(1.35); triScene.add(l)});

const partMat = new THREE.MeshStandardMaterial({color:0xb4bdd0, metalness:.15, roughness:.55, polygonOffset:true, polygonOffsetFactor:1, polygonOffsetUnits:1, side:THREE.DoubleSide});
const edgeMat = new THREE.LineBasicMaterial({color:0x14161c});
const faceHl = new THREE.MeshBasicMaterial({color:0x5b8cff, transparent:true, opacity:.5, depthWrite:false, polygonOffset:true, polygonOffsetFactor:-2, polygonOffsetUnits:-2});
const faceHv = new THREE.MeshBasicMaterial({color:0xf5a524, transparent:true, opacity:.35, depthWrite:false, polygonOffset:true, polygonOffsetFactor:-2, polygonOffsetUnits:-2});
const lineMats = {};
function lmat(color, width = 2, dashed = false){
 const k = color + '|' + width + '|' + dashed; if (lineMats[k]) return lineMats[k];
 const m = new LineMaterial({color, linewidth:width, dashed, dashSize:3, gapSize:2, depthTest:false, transparent:true, worldUnits:false});
 m.resolution.set(vp.clientWidth || 1, vp.clientHeight || 1); return lineMats[k] = m;
}

// --------- Rendu à la demande
let pending = false;
const req = () => {if (!pending){pending = true; requestAnimationFrame(render)}};
function resize(){
 const w = vp.clientWidth || 1, h = vp.clientHeight || 1; renderer.setSize(w, h, false);
 const a = w/h; camera.left = -frust*a; camera.right = frust*a; camera.top = frust; camera.bottom = -frust; camera.updateProjectionMatrix();
 Object.values(lineMats).forEach(m => m.resolution.set(w, h)); req();
}
new ResizeObserver(resize).observe(vp);
function sceneRadius(){const b = new THREE.Box3().setFromObject(modelGroup); if (S.mode === 'sketch' || S.mode === 'pickPlane') b.union(new THREE.Box3().setFromObject(skGroup)); if (b.isEmpty()) b.set(new THREE.Vector3(-50,-50,-50), new THREE.Vector3(50,50,50)); return b.getBoundingSphere(new THREE.Sphere())}
function render(){
 pending = false;
 const w = vp.clientWidth, h = vp.clientHeight;
 const sp = sceneRadius(), dir = target.clone().sub(camera.position).normalize(), d = sp.center.clone().sub(camera.position).dot(dir), Rr = sp.radius*2 + 50;
 camera.near = d - Rr; camera.far = d + Rr; camera.updateProjectionMatrix();
 renderer.setViewport(0, 0, w, h); renderer.setScissorTest(false); renderer.clear(true, true, true);
 renderer.render(scene, camera);
 const s = Math.min(90, w*0.2);
 triCam.position.copy(camera.position.clone().sub(target).normalize().multiplyScalar(4)); triCam.up.copy(camera.up); triCam.lookAt(0, 0, 0);
 renderer.setViewport(6, 6, s, s); renderer.setScissor(6, 6, s, s); renderer.setScissorTest(true); renderer.clearDepth(); renderer.render(triScene, triCam); renderer.setScissorTest(false);
 placeLabels();
}
const wpp = () => (2*frust/camera.zoom)/(vp.clientHeight || 1);

// --------- Vues
const VIEWS = {face:['Face','1',[0,0,1],[0,1,0]], arriere:['Arrière','2',[0,0,-1],[0,1,0]], gauche:['Gauche','3',[-1,0,0],[0,1,0]], droite:['Droite','4',[1,0,0],[0,1,0]],
 dessus:['Dessus','5',[0,1,0],[0,0,-1]], dessous:['Dessous','6',[0,-1,0],[0,0,1]], iso:['Iso','7',[1,1,1],[0,1,0]]};
function view(dir, up, fitIt = true){
 dir = dir.clone().normalize(); const sp = sceneRadius();
 if (fitIt){target.copy(sp.center); frust = Math.max(sp.radius*1.15, 5); camera.zoom = 1}
 camera.up.copy(up); camera.position.copy(target).addScaledVector(dir, 500); camera.lookAt(target); resize();
}
const stdView = k => view(V3(VIEWS[k][2]), V3(VIEWS[k][3]));
function fit(){view(camera.position.clone().sub(target), camera.up.clone())}
function normalToPlane(pl, fitIt = true){view(pl.n, pl.y, fitIt)}
$('#views').innerHTML = ['face','dessus','droite','iso'].map(k => `<button class="tb" data-v="${k}" title="${VIEWS[k][0]} (${VIEWS[k][1]})"><span class="lb">${VIEWS[k][0]}</span><span aria-hidden="true" class="kb" hidden>${VIEWS[k][1]}</span></button>`).join('') +
 '<button class="tb" data-v="normal" title="Normal à (8)"><span class="lb">Normal à</span></button><button class="tb" data-v="fit" title="Zoom au mieux (F)"><span class="lb">Ajuster</span></button>';
$('#views').addEventListener('click', e => {const b = e.target.closest('button'); if (!b) return; const v = b.dataset.v; if (v === 'fit') fit(); else if (v === 'normal') normalToCurrent(); else stdView(v); req()});
function normalToCurrent(){
 if (S.mode === 'sketch') return normalToPlane(planeOf(S.sk.f), false);
 if (S.face && S.face.plane) return normalToPlane(S.face.plane);
}

// --------- Navigation (molette, clic molette, Ctrl + clic molette, clic droit)
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
function toNdc(e){const r = vp.getBoundingClientRect(); ndc.set(((e.clientX-r.left)/r.width)*2-1, -((e.clientY-r.top)/r.height)*2+1); return ndc}
function rotate(dx, dy){
 const off = camera.position.clone().sub(target), right = new THREE.Vector3().crossVectors(camera.up, off).normalize();
 const q = new THREE.Quaternion().setFromAxisAngle(camera.up.clone().normalize(), -dx*0.008).multiply(new THREE.Quaternion().setFromAxisAngle(right, -dy*0.008));
 off.applyQuaternion(q); camera.up.applyQuaternion(q); camera.position.copy(target).add(off); camera.lookAt(target);
}
function pan(dx, dy){
 const off = camera.position.clone().sub(target), right = new THREE.Vector3().crossVectors(camera.up, off).normalize(), up = camera.up.clone().normalize();
 const mv = right.multiplyScalar(-dx*wpp()).addScaledVector(up, dy*wpp()); camera.position.add(mv); target.add(mv);
}
function zoomAt(e, f){
 toNdc(e); const b = new THREE.Vector3(ndc.x, ndc.y, 0).unproject(camera);
 camera.zoom = THREE.MathUtils.clamp(camera.zoom*f, 0.02, 500); camera.updateProjectionMatrix();
 const a = new THREE.Vector3(ndc.x, ndc.y, 0).unproject(camera); const d = b.sub(a); camera.position.add(d); target.add(d);
}
const ptrs = new Map(); let drag = null, pinch = null;
vp.addEventListener('contextmenu', e => e.preventDefault());
vp.addEventListener('pointerdown', e => {
 vp.focus({preventScroll:true}); vp.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, {x:e.clientX, y:e.clientY});
 if (ptrs.size === 2){const [a, b] = [...ptrs.values()]; pinch = {d:Math.hypot(a.x-b.x, a.y-b.y), x:(a.x+b.x)/2, y:(a.y+b.y)/2}; drag = null; return}
 if (e.button === 1) e.preventDefault();
 let mode = e.button === 1 ? (e.ctrlKey || e.metaKey ? 'pan' : e.shiftKey ? 'zoom' : 'rot') : e.button === 2 ? 'pan' : 'left';
 drag = {mode, x:e.clientX, y:e.clientY, x0:e.clientX, y0:e.clientY, moved:false, btn:e.button};
 if (mode === 'left' && S.mode === 'sketch'){const used = skDown(e); if (used){drag.mode = 'sketch'}}
});
vp.addEventListener('pointermove', e => {
 const pt = ptrs.get(e.pointerId); if (pt){pt.x = e.clientX; pt.y = e.clientY}
 if (pinch && ptrs.size === 2){const [a, b] = [...ptrs.values()], d = Math.hypot(a.x-b.x, a.y-b.y), mx = (a.x+b.x)/2, my = (a.y+b.y)/2; zoomAt({clientX:mx, clientY:my}, d/pinch.d); pan(mx-pinch.x, my-pinch.y); pinch = {d, x:mx, y:my}; req(); return}
 if (drag){
  const dx = e.clientX-drag.x, dy = e.clientY-drag.y; drag.x = e.clientX; drag.y = e.clientY;
  if (!drag.moved && Math.hypot(e.clientX-drag.x0, e.clientY-drag.y0) < 4) {if (S.mode === 'sketch') skMove(e); return}
  drag.moved = true;
  if (drag.mode === 'sketch'){skDrag(e); return}
  if (drag.mode === 'left') drag.mode = S.mode === 'sketch' ? 'pan' : 'rot';
  if (drag.mode === 'rot') rotate(dx, dy); else if (drag.mode === 'pan') pan(dx, dy); else zoomAt({clientX:drag.x0, clientY:drag.y0}, Math.exp(-dy*0.01));
  req(); return;
 }
 if (S.mode === 'sketch') skMove(e); else if (e.pointerType === 'mouse') hover3d(e);
});
function endPtr(e){
 ptrs.delete(e.pointerId); if (ptrs.size < 2) pinch = null;
 if (drag && e.type === 'pointerup'){
  if (drag.mode === 'sketch'){skUp(e)}
  else if (!drag.moved && drag.btn === 0){S.mode === 'sketch' ? skClick(e) : click3d(e)}
  else if (!drag.moved && drag.btn === 2 && S.mode === 'sketch') skEndChain();
 }
 if (ptrs.size === 0) drag = null;
}
vp.addEventListener('pointerup', endPtr); vp.addEventListener('pointercancel', endPtr);
vp.addEventListener('dblclick', e => {if (S.mode === 'sketch') skDbl(e)});
vp.addEventListener('wheel', e => {e.preventDefault(); zoomAt(e, Math.exp(-e.deltaY*0.0015)); req()}, {passive:false});

// =====================================================================
// Solveur d'esquisse (planegcs)
// =====================================================================
const ptOf = (sk, id) => id === 'O' ? {x:0, y:0} : sk.pts[id];
const entOf = (sk, id) => sk.ents.find(e => e.id === id);
function arcAngles(sk, e){const c = ptOf(sk, e.c), a = ptOf(sk, e.a), b = ptOf(sk, e.b); let sa = Math.atan2(a.y-c.y, a.x-c.x), ea = Math.atan2(b.y-c.y, b.x-c.x); if (ea <= sa) ea += 2*Math.PI; return [sa, ea]}
function kindOf(sk, id){if (id === 'O' || sk.pts[id]) return 'pt'; const e = entOf(sk, id); return e ? (e.t === 'point' ? 'pt' : e.t) : null}
const ptId = (sk, id) => {const e = entOf(sk, id); return e && e.t === 'point' ? e.p : id};

function gcsPrims(sk, opt = {}){
 const fixed = new Set(opt.fixed || []);
 const prims = [{id:'O', type:'point', x:0, y:0, fixed:true}];
 const fixCons = [];
 for (const c of sk.cons) if (c.t === 'fix') for (const id of c.e){
  const k = kindOf(sk, id), e = entOf(sk, id);
  if (k === 'pt') fixed.add(ptId(sk, id)); else if (k === 'line'){fixed.add(e.a); fixed.add(e.b)} else if (k === 'circle' || k === 'arc'){fixed.add(e.c); fixCons.push(k === 'circle' ? {type:'circle_radius', c_id:e.id, radius:e.r} : {type:'arc_radius', a_id:e.id, radius:e.r})}
 }
 const over = opt.pos || {};
 for (const [id, p] of Object.entries(sk.pts)){const q = over[id] || p; prims.push({id, type:'point', x:q.x, y:q.y, fixed:fixed.has(id)})}
 for (const e of sk.ents){
  if (e.t === 'line') prims.push({id:e.id, type:'line', p1_id:e.a, p2_id:e.b});
  else if (e.t === 'circle') prims.push({id:e.id, type:'circle', c_id:e.c, radius:(opt.radius && opt.radius[e.id]) || e.r});
  else if (e.t === 'arc'){const [sa, ea] = arcAngles(sk, e); prims.push({id:e.id, type:'arc', c_id:e.c, radius:(opt.radius && opt.radius[e.id]) || e.r, start_angle:sa, end_angle:ea, start_id:e.a, end_id:e.b}, {id:e.id + '~r', type:'arc_rules', a_id:e.id})}
 }
 let k = 0; const push = o => prims.push(Object.assign({id:'k' + (k++)}, o));
 fixCons.forEach(push);
 for (const c of [...sk.cons, ...(opt.extra || [])]) consPrims(sk, c).forEach(push);
 return prims;
}
function consPrims(sk, c){
 const e = c.e, K = id => kindOf(sk, id), P = id => ptId(sk, id), E = id => entOf(sk, id);
 const lines = e.filter(id => K(id) === 'line'), pts = e.filter(id => K(id) === 'pt'), circs = e.filter(id => K(id) === 'circle' || K(id) === 'arc');
 const isArc = id => K(id) === 'arc';
 switch (c.t){
  case 'coinc':
   if (pts.length === 2) return [{type:'p2p_coincident', p1_id:P(pts[0]), p2_id:P(pts[1])}];
   if (pts.length === 1 && lines.length === 1) return [{type:'point_on_line_pl', p_id:P(pts[0]), l_id:lines[0]}];
   if (pts.length === 1 && circs.length === 1) return [isArc(circs[0]) ? {type:'point_on_arc', p_id:P(pts[0]), a_id:circs[0]} : {type:'point_on_circle', p_id:P(pts[0]), c_id:circs[0]}];
   return [];
  case 'mid': return [{type:'point_on_line_pl', p_id:P(pts[0]), l_id:lines[0]}, {type:'point_on_perp_bisector_pl', p_id:P(pts[0]), l_id:lines[0]}];
  case 'horiz': return lines.length ? lines.map(l => ({type:'horizontal_l', l_id:l})) : [{type:'horizontal_pp', p1_id:P(pts[0]), p2_id:P(pts[1])}];
  case 'vert': return lines.length ? lines.map(l => ({type:'vertical_l', l_id:l})) : [{type:'vertical_pp', p1_id:P(pts[0]), p2_id:P(pts[1])}];
  case 'para': return [{type:'parallel', l1_id:lines[0], l2_id:lines[1]}];
  case 'perp': return [{type:'perpendicular_ll', l1_id:lines[0], l2_id:lines[1]}];
  case 'equal':
   if (lines.length === 2) return [{type:'equal_length', l1_id:lines[0], l2_id:lines[1]}];
   if (circs.length === 2){const [a, b] = circs; if (!isArc(a) && !isArc(b)) return [{type:'equal_radius_cc', c1_id:a, c2_id:b}]; if (isArc(a) && isArc(b)) return [{type:'equal_radius_aa', a1_id:a, a2_id:b}]; return [{type:'equal_radius_ca', c1_id:isArc(a) ? b : a, a2_id:isArc(a) ? a : b}]}
   return [];
  case 'tangent': return lines.length === 1 && circs.length === 1 ? [isArc(circs[0]) ? {type:'tangent_la', l_id:lines[0], a_id:circs[0]} : {type:'tangent_lc', l_id:lines[0], c_id:circs[0]}] : [];
  case 'concentric': return [{type:'p2p_coincident', p1_id:E(circs[0]).c, p2_id:E(circs[1]).c}];
  case 'fix': return [];
  case 'dist': return [{type:'p2p_distance', p1_id:P(e[0]), p2_id:P(e[1]), distance:c.v}];
  case 'len': {const l = E(e[0]); return [{type:'p2p_distance', p1_id:l.a, p2_id:l.b, distance:c.v}]}
  case 'pl': return [{type:'p2l_distance', p_id:P(e[0]), l_id:e[1], distance:c.v}];
  case 'll': return [{type:'p2l_distance', p_id:E(e[0]).a, l_id:e[1], distance:c.v}];
  case 'dx': return [{type:'difference', param1:{o_id:P(e[0]), prop:'x'}, param2:{o_id:P(e[1]), prop:'x'}, difference:c.v*(c.s || 1)}];
  case 'dy': return [{type:'difference', param1:{o_id:P(e[0]), prop:'y'}, param2:{o_id:P(e[1]), prop:'y'}, difference:c.v*(c.s || 1)}];
  case 'diam': return [isArc(e[0]) ? {type:'arc_radius', a_id:e[0], radius:c.v/2} : {type:'circle_diameter', c_id:e[0], diameter:c.v}];
  case 'rad': return [isArc(e[0]) ? {type:'arc_radius', a_id:e[0], radius:c.v} : {type:'circle_radius', c_id:e[0], radius:c.v}];
  case 'angle': return [{type:'l2l_angle_ll', l1_id:e[0], l2_id:e[1], angle:c.v*DEG*(c.s || 1)}];
 }
 return [];
}
// Résout ; renvoie {ok, dof, pts, radius} sans modifier l'esquisse
function solveRaw(sk, opt){
 const g = new GcsWrapper(new GCS.GcsSystem());
 try {
  g.push_primitives_and_params(gcsPrims(sk, opt));
  const st = g.solve(); g.apply_solution();
  const out = {st, ok:st === 0 || st === 1, dof:g.gcs.dof(), pts:{}, radius:{}, conflict:g.has_gcs_conflicting_constraints()};
  for (const p of g.sketch_index.get_primitives()){
   if (p.type === 'point' && p.id !== 'O') out.pts[p.id] = {x:p.x, y:p.y};
   else if (p.type === 'circle' || p.type === 'arc') out.radius[p.id] = p.radius;
  }
  if (out.ok && !residualOk(sk, out, opt)) out.ok = false;
  return out;
 } catch (err){return {ok:false, dof:0, pts:{}, radius:{}, err}}
 finally {try {g.destroy_gcs_module()} catch(e){}}
}
// Contrôle indépendant du résultat (le solveur numérique peut « réussir » sans tout satisfaire)
function residualOk(sk, r, opt){
 const tmp = {pts:Object.assign({}, sk.pts, r.pts), ents:sk.ents.map(e => r.radius[e.id] ? Object.assign({}, e, {r:r.radius[e.id]}) : e), cons:sk.cons};
 const P = id => id === 'O' ? {x:0, y:0} : tmp.pts[ptId(tmp, id)];
 const E = id => tmp.ents.find(e => e.id === id);
 const tol = 1e-4;
 for (const c of [...sk.cons, ...((opt && opt.extra) || [])]){
  const e = c.e;
  if (c.t === 'dist'){const a = P(e[0]), b = P(e[1]); if (Math.abs(Math.hypot(b.x-a.x, b.y-a.y) - c.v) > tol*Math.max(1, c.v)) return false}
  if (c.t === 'len'){const l = E(e[0]), a = P(l.a), b = P(l.b); if (Math.abs(Math.hypot(b.x-a.x, b.y-a.y) - c.v) > tol*Math.max(1, c.v)) return false}
  if (c.t === 'diam'){const x = E(e[0]); if (Math.abs(2*x.r - c.v) > tol*Math.max(1, c.v)) return false}
  if (c.t === 'rad'){const x = E(e[0]); if (Math.abs(x.r - c.v) > tol*Math.max(1, c.v)) return false}
  if (c.t === 'coinc'){const ps = e.filter(id => kindOf(tmp, id) === 'pt'); if (ps.length === 2){const a = P(ps[0]), b = P(ps[1]); if (Math.hypot(a.x-b.x, a.y-b.y) > 1e-3) return false}}
 }
 return true;
}
// Applique le résultat d'une résolution à l'esquisse
function applySolve(sk, r){
 for (const [id, p] of Object.entries(r.pts)) if (sk.pts[id]){sk.pts[id].x = p.x; sk.pts[id].y = p.y}
 for (const e of sk.ents) if (r.radius[e.id] != null){e.r = r.radius[e.id]}
 for (const e of sk.ents) if (e.t === 'circle' || e.t === 'arc'){if (e.t === 'arc'){const c = sk.pts[e.c], a = sk.pts[e.a]; e.r = Math.hypot(a.x-c.x, a.y-c.y)}}
}
function solveSketch(sk, opt){const r = solveRaw(sk, opt); if (r.ok) applySolve(sk, r); return r}
// Quels éléments sont encore libres (bleu) ? Test par petits déplacements
function analyseDof(sk){
 const r = solveRaw(sk); const st = {dof:r.dof, ok:r.ok, free:new Set(), conflict:!r.ok || r.conflict};
 if (!r.ok || r.dof === 0) return st;
 const d = 0.37;
 for (const [id, p] of Object.entries(sk.pts)){
  const tx = solveRaw(sk, {fixed:[id], pos:{[id]:{x:p.x+d, y:p.y}}}), ty = tx.ok ? tx : solveRaw(sk, {fixed:[id], pos:{[id]:{x:p.x, y:p.y+d}}});
  if (tx.ok || ty.ok) st.free.add(id);
 }
 for (const e of sk.ents) if (e.t === 'circle' || e.t === 'arc'){
  const t = solveRaw(sk, {extra:[{t:'rad', e:[e.id], v:e.r*1.05 + 0.1}]}); if (t.ok) st.free.add(e.id);
 }
 return st;
}

// =====================================================================
// Contours fermés → profil (Drawing replicad)
// =====================================================================
function loopsOf(sk){
 const par = {}; const f = x => par[x] === undefined || par[x] === x ? (par[x] = x) : (par[x] = f(par[x]));
 const un = (a, b) => {par[f(a)] = f(b)};
 for (const c of sk.cons) if (c.t === 'coinc'){const ps = c.e.filter(id => kindOf(sk, id) === 'pt').map(id => ptId(sk, id)); if (ps.length === 2) un(ps[0], ps[1])}
 const segs = sk.ents.filter(e => (e.t === 'line' || e.t === 'arc') && !e.c2);
 const node = id => f(id);
 const adj = {};
 segs.forEach((s, i) => {for (const n of [node(s.a), node(s.b)]) (adj[n] = adj[n] || []).push(i)});
 const loops = [], errs = [];
 for (const [n, l] of Object.entries(adj)){if (l.length === 1) errs.push('ouvert'); if (l.length > 2) errs.push('ramifié')}
 const used = new Set();
 for (let i = 0; i < segs.length; i++){
  if (used.has(i)) continue;
  const start = node(segs[i].a); let cur = start, idx = i; const seq = []; let ok = false;
  while (true){
   used.add(idx); const s = segs[idx]; const fwd = node(s.a) === cur; seq.push({s, fwd}); cur = fwd ? node(s.b) : node(s.a);
   if (cur === start){ok = true; break}
   const nx = (adj[cur] || []).find(j => !used.has(j)); if (nx === undefined) break; idx = nx;
  }
  if (ok) loops.push(seq);
 }
 for (const c of sk.ents.filter(e => e.t === 'circle' && !e.c2)) loops.push([{circle:c}]);
 return {loops, errs};
}
function loopPoly(sk, loop){
 const P = id => ptOf(sk, id), pts = [];
 for (const {s, fwd, circle} of loop){
  if (circle){const c = P(circle.c); for (let k = 0; k < 48; k++){const a = k/48*2*Math.PI; pts.push([c.x + circle.r*Math.cos(a), c.y + circle.r*Math.sin(a)])} continue}
  const a = P(fwd ? s.a : s.b);
  if (s.t === 'line') pts.push([a.x, a.y]);
  else {const c = P(s.c); let [sa, ea] = arcAngles(sk, s); const n = 16; for (let k = 0; k < n; k++){const t = fwd ? sa + (ea-sa)*k/n : ea - (ea-sa)*k/n; pts.push([c.x + s.r*Math.cos(t), c.y + s.r*Math.sin(t)])}}
 }
 return pts;
}
const polyArea = p => p.reduce((s, a, i) => {const b = p[(i+1) % p.length]; return s + a[0]*b[1] - b[0]*a[1]}, 0)/2;
function inPoly(pt, poly){let ins = false; for (let i = 0, j = poly.length-1; i < poly.length; j = i++){const [xi, yi] = poly[i], [xj, yj] = poly[j]; if (((yi > pt[1]) !== (yj > pt[1])) && pt[0] < (xj-xi)*(pt[1]-yi)/(yj-yi) + xi) ins = !ins} return ins}
function loopDrawing(sk, loop){
 const P = id => ptOf(sk, id);
 if (loop[0].circle){const c = loop[0].circle, ce = P(c.c); return R.drawCircle(c.r).translate(ce.x, ce.y)}
 const s0 = loop[0], p0 = P(s0.fwd ? s0.s.a : s0.s.b);
 let pen = R.draw([p0.x, p0.y]);
 loop.forEach(({s, fwd}, i) => {
  const last = i === loop.length - 1; const b = P(fwd ? s.b : s.a); const end = last ? [p0.x, p0.y] : [b.x, b.y];
  if (s.t === 'line') pen = pen.lineTo(end);
  else {const c = P(s.c); const [sa, ea] = arcAngles(sk, s); const m = (sa+ea)/2; pen = pen.threePointsArcTo(end, [c.x + s.r*Math.cos(m), c.y + s.r*Math.sin(m)])}
 });
 return pen.close();
}
function profileOf(sk){
 const {loops, errs} = loopsOf(sk);
 if (!loops.length) throw new Error(errs.length ? 'Le contour de l’esquisse n’est pas fermé.' : 'L’esquisse ne contient aucun contour fermé.');
 const L = loops.map(l => {const poly = loopPoly(sk, l); return {l, poly, area:Math.abs(polyArea(poly))}}).sort((a, b) => b.area - a.area);
 L.forEach((x, i) => {x.depth = L.filter((y, j) => j !== i && y.area > x.area && inPoly(x.poly[0], y.poly)).length});
 let D = null;
 for (const x of L){const d = loopDrawing(sk, x.l); if (x.depth % 2 === 0) D = D ? D.fuse(d) : d; else if (D) D = D.cut(d)}
 return D;
}

// =====================================================================
// Reconstruction de la pièce
// =====================================================================
function apply(shape, solid, op){
 if (op === 'add') return shape ? shape.fuse(solid) : solid;
 if (!shape) throw new Error('Il n’y a pas encore de matière à enlever.');
 return shape.cut(solid);
}
function sizeOf(shape){if (!shape) return 200; const b = shape.boundingBox; return Math.max(50, Math.hypot(b.width, b.height, b.depth)*2)}
function edgeGeo(e){
 const P = t => {const q = e.pointAt(t); return new THREE.Vector3(q.x, q.y, q.z)};
 const a = P(0), b = P(1/3), c = P(2/3), d = P(1);
 const ab = b.clone().sub(a), ac = c.clone().sub(a), n = ab.clone().cross(ac);
 if (n.length() < 1e-9*Math.max(1, ab.lengthSq())) return {t:'line', a, dir:d.clone().sub(a).normalize(), pts:[a, b, c, d]};
 // cercle passant par a, b, c
 const nn = n.clone().normalize(), bc = ab.clone().cross(n).multiplyScalar(ac.lengthSq()).add(n.clone().cross(ac).multiplyScalar(ab.lengthSq())).divideScalar(2*n.lengthSq());
 const ctr = a.clone().sub(bc); return {t:"circle", ctr, n:nn, r:bc.length(), pts:[a, b, c, d]};
}
function findEdges(shape, pts){
 const edges = shape.edges, out = [];
 const diag = sizeOf(shape)/2, tol = Math.max(0.05, diag*0.004);
 const geos = edges.map(edgeGeo);
 for (const raw of pts){
  const p = new THREE.Vector3(...(raw.p || raw));
  let best = null, bd = Infinity;
  edges.forEach((e, i) => {let d = Infinity; for (let k = 0; k <= 8; k++){const q = e.pointAt(k/8); d = Math.min(d, Math.hypot(q.x-p.x, q.y-p.y, q.z-p.z))} if (d < bd){bd = d; best = e}});
  if (!best || bd > tol){
   // repli : même droite support, ou même cercle (rayon et axe)
   const g0 = raw.g; best = null; bd = Infinity;
   geos.forEach((g, i) => {
    let d = Infinity;
    if (g.t === 'line' && (!g0 || g0.t === 'line')){const w = p.clone().sub(g.a); d = w.sub(g.dir.clone().multiplyScalar(w.dot(g.dir))).length()}
    if (g.t === 'circle' && g0 && g0.t === 'circle' && Math.abs(g.r - g0.r) < 1e-3*Math.max(1, g0.r) && Math.abs(g.n.dot(new THREE.Vector3(...g0.n))) > 0.9999){const w = p.clone().sub(g.ctr); const ax = w.dot(g.n); d = Math.abs(Math.sqrt(Math.max(0, w.lengthSq() - ax*ax)) - g.r)}
    if (d < bd - 1e-6){bd = d; best = edges[i]}
   });
   if (best && g0 && g0.t === 'circle' && g0.rank){
    const n0 = new THREE.Vector3(...g0.n), cands = [];
    geos.forEach((g, i) => {if (g.t !== 'circle' || Math.abs(g.r - g0.r) > 1e-3*Math.max(1, g0.r) || Math.abs(g.n.dot(n0)) < 0.9999) return; const w = p.clone().sub(g.ctr); const ax = w.dot(g.n); if (Math.abs(Math.sqrt(Math.max(0, w.lengthSq() - ax*ax)) - g.r) <= tol) cands.push({e:edges[i], h:g.ctr.dot(n0)})});
    const hs = [...new Set(cands.map(c => +c.h.toFixed(4)))].sort((a, b) => a - b);
    if (hs.length > 1){const want = g0.rank === 'max' ? hs[hs.length-1] : hs[0]; const c = cands.find(c => Math.abs(c.h - want) < 1e-3); if (c) best = c.e}
   }
   if (!best || bd > tol) throw new Error('Une arête choisie n\u2019existe plus (la géométrie a changé). Éditez la fonction et resélectionnez-la.');
  }
  if (!out.includes(best)) out.push(best);
 }
 return out;
}
function rebuild(stopAt = S.stopAt){
 const t0 = performance.now(); let shape = null; const res = {};
 for (const f of S.doc.features){
  if (stopAt && f.id === stopAt) break;
  if (f.suppressed){res[f.id] = {ok:true}; continue}
  try {
   if (f.type === 'sketch'){res[f.id] = {ok:true}; continue}
   if (f.type === 'extrude' || f.type === 'cut'){
    const sk = feat(f.sketch); if (!sk) throw new Error('Esquisse introuvable.');
    const pl = planeOf(sk), dr = profileOf(sk); const dir = f.flip ? -1 : 1;
    let solid;
    if (f.end === 'through'){const L = sizeOf(shape); solid = dr.sketchOnPlane(rPlane(pl, -L/2)).extrude(L)}
    else if (f.end === 'mid') solid = dr.sketchOnPlane(rPlane(pl, -f.depth/2)).extrude(f.depth);
    else solid = dr.sketchOnPlane(rPlane(pl)).extrude(dir*f.depth*(f.type === 'cut' && !sk.plane.base ? -1 : 1));
    shape = apply(shape, solid, f.type === 'extrude' ? 'add' : 'cut');
   } else if (f.type === 'revolve' || f.type === 'rcut'){
    const sk = feat(f.sketch); if (!sk) throw new Error('Esquisse introuvable.');
    const pl = planeOf(sk), ax = entOf(sk, f.axis); if (!ax || ax.t !== 'line') throw new Error('Choisissez une ligne de l’esquisse comme axe de révolution.');
    const A = to3(pl, ptOf(sk, ax.a).x, ptOf(sk, ax.a).y), B = to3(pl, ptOf(sk, ax.b).x, ptOf(sk, ax.b).y);
    const skNoAxis = Object.assign({}, sk, {ents:sk.ents.map(e => e.id === ax.id ? Object.assign({}, e, {c2:true}) : e)});
    const dr = profileOf(skNoAxis); const d = B.clone().sub(A).multiplyScalar(f.flip ? -1 : 1);
    const solid = dr.sketchOnPlane(rPlane(pl)).revolve(d.toArray(), {origin:A.toArray(), angle:f.angle || 360});
    shape = apply(shape, solid, f.type === 'revolve' ? 'add' : 'cut');
   } else if (f.type === 'fillet' || f.type === 'chamfer'){
    if (!shape) throw new Error('Aucune pièce sur laquelle appliquer la fonction.');
    if (!f.edges.length) throw new Error('Sélectionnez au moins une arête.');
    const list = findEdges(shape, f.edges);
    shape = f.type === 'fillet' ? shape.fillet(f.r, e => e.inList(list)) : shape.chamfer(f.d, e => e.inList(list));
   } else if (f.type === 'hole'){
    const sk = feat(f.sketch); if (!sk) throw new Error('Esquisse des emplacements introuvable.');
    const pts = sk.ents.filter(e => e.t === 'point').map(e => sk.pts[e.p]); if (!pts.length) throw new Error('Placez au moins un point dans l’esquisse du perçage.');
    if (!shape) throw new Error('Il n’y a pas encore de matière à percer.');
    const pl = planeOf(sk); let D = null;
    for (const p of pts){const c = R.drawCircle(f.d/2).translate(p.x, p.y); D = D ? D.fuse(c) : c}
    const L = sizeOf(shape);
    const solid = f.end === 'through' ? D.sketchOnPlane(rPlane(pl, -L/2)).extrude(L) : D.sketchOnPlane(rPlane(pl)).extrude(-f.depth*(f.flip ? -1 : 1));
    shape = apply(shape, solid, 'cut');
   }
   res[f.id] = {ok:true};
  } catch (err){res[f.id] = {ok:false, err:errText(err)}}
 }
 S.shape = shape; S.res = res; S.buildMs = performance.now() - t0;
 showShape(); drawFree();
}
function errText(e){
 const m = (e && e.message) || String(e);
 if (/^\d+$/.test(m) || /BRep|Standard_|StdFail|OCC|NotDone/i.test(m)) return 'Le noyau n’a pas pu calculer cette fonction (géométrie impossible : rayon trop grand, profil qui coupe l’axe…).';
 return m;
}

// --------- Esquisses pas encore utilisées : visibles comme dans SolidWorks
function sketchSegs(f){
 const pl = planeOf(f), pos = [], lift = pl.n.clone().multiplyScalar(0.02);
 const W = (u, v) => to3(pl, u, v).add(lift).toArray();
 for (const e of f.ents){
  if (e.t === 'line'){const a = ptOf(f, e.a), b = ptOf(f, e.b); pos.push(...W(a.x, a.y), ...W(b.x, b.y))}
  else if (e.t === 'circle' || e.t === 'arc'){const c = ptOf(f, e.c); const [sa, ea] = e.t === 'arc' ? arcAngles(f, e) : [0, 2*Math.PI]; for (let k = 0; k < 48; k++){const t1 = sa + (ea-sa)*k/48, t2 = sa + (ea-sa)*(k+1)/48; pos.push(...W(c.x + e.r*Math.cos(t1), c.y + e.r*Math.sin(t1)), ...W(c.x + e.r*Math.cos(t2), c.y + e.r*Math.sin(t2)))}}
 }
 return pos;
}
function drawFree(){
 freeGroup.clear(); if (S.mode === 'sketch') return req();
 const stopIdx = S.stopAt ? S.doc.features.findIndex(f => f.id === S.stopAt) : Infinity;
 S.doc.features.forEach((f, i) => {
  if (f.type !== 'sketch' || i >= stopIdx || consumers(f.id).length) return;
  const pos = sketchSegs(f); const pts = [];
  f.ents.filter(e => e.t === 'point').forEach(e => {const p = f.pts[e.p]; pts.push(...to3(planeOf(f), p.x, p.y).toArray())});
  if (pos.length){const l = new LineSegments2(new LineSegmentsGeometry().setPositions(pos), lmat(S.sel === f.id ? 0x12c2e9 : 0x3d6cf0, S.sel === f.id ? 3 : 1.5)); l.renderOrder = 4; freeGroup.add(l)}
  if (pts.length){const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)); freeGroup.add(new THREE.Points(g, new THREE.PointsMaterial({color:0x3d6cf0, size:7, sizeAttenuation:false, depthTest:false})))}
 });
 req();
}
// --------- Affichage de la pièce
function showShape(){
 modelGroup.clear(); S.faces = []; S.edges = []; S.triFace = null; S.segEdge = null; clearFaceSel();
 const sh = S.shape; if (!sh) {req(); return}
 const b = sh.boundingBox, diag = Math.hypot(b.width, b.height, b.depth) || 10;
 const m = sh.mesh({tolerance:Math.max(0.01, diag*0.0008), angularTolerance:0.15});
 const g = new THREE.BufferGeometry();
 g.setAttribute('position', new THREE.Float32BufferAttribute(m.vertices, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(m.normals, 3)); g.setIndex(m.triangles);
 const mesh = new THREE.Mesh(g, partMat); modelGroup.add(mesh); S.mesh = mesh;
 const nt = m.triangles.length/3, tf = new Int32Array(nt).fill(-1);
 m.faceGroups.forEach((fg, i) => {for (let t = fg.start/3; t < (fg.start + fg.count)/3; t++) tf[t] = i});
 S.triFace = tf; S.faceGroups = m.faceGroups; S.faces = sh.faces;
 const me = sh.meshEdges({tolerance:Math.max(0.01, diag*0.0008), angularTolerance:0.15});
 const eg = new THREE.BufferGeometry(); eg.setAttribute('position', new THREE.Float32BufferAttribute(me.lines, 3));
 const edges = new THREE.LineSegments(eg, edgeMat); modelGroup.add(edges); S.edgeObj = edges;
 const ns = me.lines.length/6, se = new Int32Array(ns).fill(-1);
 me.edgeGroups.forEach((gr, i) => {for (let s = gr.start/2; s < (gr.start + gr.count)/2; s++) se[s] = i});
 S.segEdge = se; S.edgeGroups = me.edgeGroups; S.edges = sh.edges;
 req();
}
function faceSubMesh(fi, mat){
 const fg = S.faceGroups[fi], g = new THREE.BufferGeometry(); g.setAttribute('position', S.mesh.geometry.attributes.position);
 g.setIndex(Array.from(S.mesh.geometry.index.array.slice(fg.start, fg.start + fg.count))); return new THREE.Mesh(g, mat);
}
function edgeSubLine(ei, color){
 const gr = S.edgeGroups[ei], pos = S.edgeObj.geometry.attributes.position.array.slice(gr.start*3, (gr.start + gr.count)*3);
 const g = new LineSegmentsGeometry().setPositions(pos); return new LineSegments2(g, lmat(color, 4));
}
// Plan d'une face plane de la pièce
function facePlane(fi){
 const f = S.faces[fi]; if (!f || f.geomType !== 'PLANE') return null;
 const c = f.center, nv = f.normalAt(c); const n = new THREE.Vector3(nv.x, nv.y, nv.z).normalize(), C = new THREE.Vector3(c.x, c.y, c.z);
 let x = new THREE.Vector3(1, 0, 0); if (Math.abs(x.dot(n)) > .9) x = new THREE.Vector3(0, 0, -1); x.sub(n.clone().multiplyScalar(x.dot(n))).normalize();
 const o = n.clone().multiplyScalar(n.dot(C));
 const pl = {o, x, n, y:n.clone().cross(x), C};
 return pl;
}

// =====================================================================
// Sélection dans la pièce (faces, arêtes)
// =====================================================================
let hv = null;
function pick3d(e, wantEdges){
 if (!S.mesh) return null;
 ray.setFromCamera(toNdc(e), camera); ray.params.Line.threshold = wpp()*6;
 if (wantEdges && S.edgeObj){const h = ray.intersectObject(S.edgeObj)[0]; if (h){const ei = S.segEdge[Math.floor(h.index/2)]; if (ei >= 0) return {edge:ei, pt:h.point}}}
 const h = ray.intersectObject(S.mesh)[0]; if (!h) return null;
 return {face:S.triFace[h.faceIndex], pt:h.point};
}
function pickBasePlane(e){
 ray.setFromCamera(toNdc(e), camera); const h = ray.intersectObjects(planeGroup.children)[0];
 return h ? h.object.userData.base : null;
}
function hover3d(e){
 const want = S.pm && (S.pm.type === 'fillet' || S.pm.type === 'chamfer');
 const h = pick3d(e, want); const k = h ? (h.edge != null ? 'e' + h.edge : 'f' + h.face) : null;
 if (hv && hv.k === k) return;
 if (hv) hlGroup.remove(hv.obj); hv = null;
 if (h){const obj = h.edge != null ? edgeSubLine(h.edge, 0xf5a524) : faceSubMesh(h.face, faceHv); hlGroup.add(obj); hv = {k, obj}}
 req();
}
let faceSelObj = null;
function clearFaceSel(){S.face = null; if (faceSelObj){hlGroup.remove(faceSelObj); faceSelObj = null}; if (hv){hlGroup.remove(hv.obj); hv = null}}
function click3d(e){
 if (S.mode === 'pickPlane'){
  const b = pickBasePlane(e); if (b){startSketch({base:b, offset:0}); return}
  const h = pick3d(e); if (h && h.face >= 0){const pl = facePlane(h.face); if (pl){startSketch({o:pl.o.toArray(), x:pl.x.toArray(), n:pl.n.toArray(), label:'Face plane'}); return} toast('Choisissez une face plane.')}
  return;
 }
 if (S.pm && (S.pm.type === 'fillet' || S.pm.type === 'chamfer')){
  const h = pick3d(e, true); if (!h || h.edge == null) return;
  const f = S.pm.f, q = S.edges[h.edge].pointAt(0.5), p = [q.x, q.y, q.z];
  const i = f.edges.findIndex(x => {const xp = x.p || x; return Math.hypot(xp[0]-p[0], xp[1]-p[1], xp[2]-p[2]) < 1e-3});
  if (i >= 0) f.edges.splice(i, 1); else {const g = edgeGeo(S.edges[h.edge]); let rank;
   if (g.t === 'circle'){const hs = S.edges.map(edgeGeo).filter(o => o.t === 'circle' && Math.abs(o.r - g.r) < 1e-3*Math.max(1, g.r) && Math.abs(o.n.dot(g.n)) > 0.9999 && o.ctr.clone().sub(g.ctr).sub(g.n.clone().multiplyScalar(o.ctr.clone().sub(g.ctr).dot(g.n))).length() < 1e-3).map(o => o.ctr.dot(g.n)); const me = g.ctr.dot(g.n); rank = me >= Math.max(...hs) - 1e-6 ? 'max' : me <= Math.min(...hs) + 1e-6 ? 'min' : null}
   f.edges.push({p, g:g.t === 'circle' ? {t:'circle', r:g.r, n:g.n.toArray(), rank} : {t:'line'}})}
  pmChanged(); return;
 }
 const h = pick3d(e);
 clearFaceSel();
 if (h && h.face >= 0){S.face = {fi:h.face, plane:facePlane(h.face)}; faceSelObj = faceSubMesh(h.face, faceHl); hlGroup.add(faceSelObj); S.sel = null}
 renderUI(); req();
}
function showPlanes(on){
 planeGroup.clear(); if (!on) return req();
 const sp = sceneRadius(), s = Math.max(40, sp.radius*1.4);
 for (const [k, p] of Object.entries(BASE)){
  const pl = planeOf({plane:{base:k}}); const g = new THREE.PlaneGeometry(s, s);
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({color:0x5b8cff, transparent:true, opacity:.12, side:THREE.DoubleSide, depthWrite:false}));
  const M = new THREE.Matrix4().makeBasis(pl.x, pl.y, pl.n); m.quaternion.setFromRotationMatrix(M); m.userData.base = k; planeGroup.add(m);
  const bd = new THREE.LineSegments(new THREE.EdgesGeometry(g), new THREE.LineBasicMaterial({color:0x5b8cff})); bd.quaternion.copy(m.quaternion); planeGroup.add(bd);
 }
 req();
}

// =====================================================================
// Mode esquisse
// =====================================================================
const COL = {under:0x2f6fed, full:0x15161a, fullDark:0xe9e9ef, constr:0x8a93a6, sel:0x12c2e9, hov:0xf5a524, err:0xe5484d, prev:0x7f8ea8};
const dark = () => matchMedia('(prefers-color-scheme: dark)').matches && document.documentElement.dataset.theme !== 'light' || document.documentElement.dataset.theme === 'dark';
function startSketch(plane, then){
 pushUndo();
 const f = {id:newId(), type:'sketch', name:nextName('sketch'), plane, pts:{}, ents:[], cons:[], nid:1};
 const idx = S.pm && S.pm.insertBefore ? S.doc.features.indexOf(S.pm.insertBefore) : -1;
 if (idx >= 0) S.doc.features.splice(idx, 0, f); else S.doc.features.push(f);
 showPlanes(false); S.pm = null;
 editSketch(f, {isNew:true, then});
}
function editSketch(f, o = {}){
 const snap = JSON.stringify(S.doc);
 S.mode = 'sketch'; S.tab = 'esquisse'; freeGroup.clear();
 S.sk = {f, tool:o.isNew ? 'line' : 'select', sel:new Set(), chain:null, draft:null, hover:null, construction:false, snap, isNew:!!o.isNew, then:o.then, dofs:null, msg:''};
 S.stopAt = S.doc.features[S.doc.features.indexOf(f) + 1] ? S.doc.features[S.doc.features.indexOf(f) + 1].id : null;
 rebuild();
 normalToPlane(planeOf(f), !S.shape);
 skUpdate(); renderUI();
}
function exitSketch(keep){
 const sk = S.sk; if (!sk) return;
 if (!keep){S.doc = JSON.parse(sk.snap)}
 else commit();
 S.mode = 'idle'; S.sk = null; S.stopAt = null; skGroup.clear(); clearLabels();
 rebuild(); S.tab = 'fonctions';
 const f = keep ? feat(sk.f.id) : null;
 if (f && f.ents.length === 0 && sk.isNew){S.doc.features = S.doc.features.filter(x => x !== f); rebuild()}
 else if (f && sk.then){openFeature(sk.then, f); return}
 S.sel = f ? f.id : null; renderUI();
}
const skf = () => S.sk.f;
function nid(p){const f = skf(); return p + (f.nid++)}
function addPt(x, y){const id = nid('p'); skf().pts[id] = {x, y}; return id}
// Coordonnées esquisse de la souris
function mouse2(e){
 const pl = planeOf(skf()); ray.setFromCamera(toNdc(e), camera);
 const P = new THREE.Vector3(); if (!ray.ray.intersectPlane(new THREE.Plane().setFromNormalAndCoplanarPoint(pl.n, pl.o), P)) return null;
 const [u, v] = to2(pl, P); return {x:u, y:v};
}
const tolS = () => wpp()*9;
function nearPt(m, exclude){
 const f = skf(); let best = null, bd = tolS();
 const cand = [['O', {x:0, y:0}], ...Object.entries(f.pts)];
 for (const [id, p] of cand){if (exclude && exclude.includes(id)) continue; const d = Math.hypot(p.x-m.x, p.y-m.y); if (d < bd){bd = d; best = id}}
 return best;
}
function distSeg(m, a, b){const dx = b.x-a.x, dy = b.y-a.y, l2 = dx*dx + dy*dy || 1e-12; const t = Math.max(0, Math.min(1, ((m.x-a.x)*dx + (m.y-a.y)*dy)/l2)); return Math.hypot(a.x + t*dx - m.x, a.y + t*dy - m.y)}
function nearEnt(m){
 const f = skf(); let best = null, bd = tolS();
 for (const e of f.ents){
  let d = Infinity;
  if (e.t === 'line') d = distSeg(m, ptOf(f, e.a), ptOf(f, e.b));
  else if (e.t === 'circle'){const c = ptOf(f, e.c); d = Math.abs(Math.hypot(m.x-c.x, m.y-c.y) - e.r)}
  else if (e.t === 'arc'){const c = ptOf(f, e.c); const [sa, ea] = arcAngles(f, e); let a = Math.atan2(m.y-c.y, m.x-c.x); while (a < sa) a += 2*Math.PI; if (a <= ea) d = Math.abs(Math.hypot(m.x-c.x, m.y-c.y) - e.r)}
  if (d < bd){bd = d; best = e.id}
 }
 return best;
}
function hitAt(m){const p = nearPt(m); if (p){const pe = skf().ents.find(e => e.t === 'point' && e.p === p); return pe ? pe.id : p} return nearEnt(m)}
// --- outils
const TOOLS = {select:'Sélection', line:'Ligne', rect:'Rectangle', circle:'Cercle', arc:'Arc', point:'Point', dim:'Cotation intelligente'};
function setTool(t){const s = S.sk; s.tool = t; s.chain = null; s.draft = null; s.dimPick = null; closeDimEdit(); skUpdate(); renderUI()}
function snapHV(from, m){
 const dx = m.x-from.x, dy = m.y-from.y, tan = Math.tan(4*DEG);
 if (Math.abs(dy) <= tan*Math.abs(dx) && Math.abs(dx) > 1e-9) return {x:m.x, y:from.y, hv:'horiz'};
 if (Math.abs(dx) <= tan*Math.abs(dy) && Math.abs(dy) > 1e-9) return {x:from.x, y:m.y, hv:'vert'};
 return {x:m.x, y:m.y, hv:null};
}
function skMove(e){
 const s = S.sk, m = mouse2(e); if (!m) return; s.mouse = m;
 const snap = nearPt(m);
 s.hover = s.tool === 'select' || s.tool === 'dim' ? hitAt(m) : snap;
 if (s.tool === 'line' && s.chain){const a = ptOf(skf(), s.chain); const q = snap ? ptOf(skf(), snap) : snapHV(a, m); s.draft = {t:'line', a:{x:a.x, y:a.y}, b:{x:q.x, y:q.y}, hv:snap ? null : q.hv}}
 else if (s.tool === 'rect' && s.p1) s.draft = {t:'rect', a:s.p1, b:snap ? ptOf(skf(), snap) : m};
 else if (s.tool === 'circle' && s.c) {const c = s.c; s.draft = {t:'circle', c, r:Math.hypot(m.x-c.x, m.y-c.y)}}
 else if (s.tool === 'arc' && s.c){
  const c = s.c;
  if (!s.a) s.draft = {t:'line', a:c, b:m, constr:true};
  else {const a0 = Math.atan2(s.a.y-c.y, s.a.x-c.x), am = Math.atan2(m.y-c.y, m.x-c.x); let d = am - (s.lastAng ?? a0); while (d > Math.PI) d -= 2*Math.PI; while (d < -Math.PI) d += 2*Math.PI; s.sweep = (s.sweep || 0) + d; s.lastAng = am; s.draft = {t:'arc', c, r:Math.hypot(s.a.x-c.x, s.a.y-c.y), a0, sweep:s.sweep}}
 }
 status(); skDraw();
}
function skDown(e){
 const s = S.sk; if (s.tool !== 'select') return false; const m = mouse2(e); if (!m) return false;
 const h = hitAt(m); if (!h) return false;
 s.dragId = h; s.dragStart = m; s.dragSnap = JSON.stringify(skf()); return true;
}
function skDrag(e){
 const s = S.sk, f = skf(), m = mouse2(e); if (!m || !s.dragId) return;
 const id = s.dragId, k = kindOf(f, id);
 const base = JSON.parse(s.dragSnap); const dx = m.x - s.dragStart.x, dy = m.y - s.dragStart.y;
 const tmp = Object.assign({}, f, {pts:base.pts, ents:base.ents});
 let r;
 if (k === 'pt' && id !== 'O'){const p = ptId(f, id); r = solveRaw(tmp, {fixed:[p], pos:{[p]:{x:m.x, y:m.y}}})}
 else if (k === 'line'){const l = entOf(tmp, id); r = solveRaw(tmp, {fixed:[l.a, l.b].filter(x => x !== 'O'), pos:{[l.a]:{x:base.pts[l.a]?.x + dx, y:base.pts[l.a]?.y + dy}, [l.b]:{x:base.pts[l.b]?.x + dx, y:base.pts[l.b]?.y + dy}}})}
 else if (k === 'circle' || k === 'arc'){const c = entOf(tmp, id), ce = ptOf(tmp, c.c); r = solveRaw(tmp, {extra:[{t:'rad', e:[id], v:Math.max(0.01, Math.hypot(m.x-ce.x, m.y-ce.y))}]})}
 if (r && r.ok){f.pts = clone(base.pts); f.ents = clone(base.ents); applySolve(f, r); s.dragged = true; skDraw(); status()}
}
function skUp(){const s = S.sk; if (s.dragged){commit(); s.dofs = null; skUpdate()} s.dragId = null; s.dragged = false}
function skDbl(e){const s = S.sk; if (s.tool === 'line') return skEndChain(); const id = S.sk.hover; const lb = id && skf().cons.find(c => c.id === id); if (lb) openDimEdit(lb)}
function skEndChain(){const s = S.sk; s.chain = null; s.draft = null; s.p1 = null; s.c = null; s.a = null; skDraw()}
function addCons(t, e, extra = {}){const f = skf(); const c = Object.assign({id:nid('c'), t, e}, extra); f.cons.push(c); return c}
function hasCons(t, e){return skf().cons.some(c => c.t === t && c.e.length === e.length && e.every(x => c.e.includes(x)))}
function skClick(e){
 const s = S.sk, f = skf(), m = mouse2(e); if (!m) return;
 const snap = nearPt(m), P = id => ptOf(f, id);
 if (s.tool === 'select'){
  const h = hitAt(m);
  if (!h){if (!e.ctrlKey && !e.shiftKey) s.sel.clear()}
  else {if (!(e.ctrlKey || e.shiftKey || e.metaKey)) {const had = s.sel.has(h) && s.sel.size === 1; s.sel.clear(); if (had) {skUpdate(); renderUI(); return}} s.sel.has(h) ? s.sel.delete(h) : s.sel.add(h)}
  skDraw(); renderUI(); return;
 }
 if (s.tool === 'dim') return dimClick(m, e);
 pushUndo();
 if (s.tool === 'point'){const id = addPt(m.x, m.y); f.ents.push({id:nid('e'), t:'point', p:id}); if (snap) addCons('coinc', [id, snap]); afterEdit(); return}
 if (s.tool === 'line'){
  if (!s.chain){s.chain = snap || addPt(m.x, m.y); s.chainStart = s.chain; skMove(e); undoPop(); return}
  const a = s.chain, A = P(a); const q = snap ? P(snap) : snapHV(A, m);
  if (Math.hypot(q.x-A.x, q.y-A.y) < 1e-6){undoPop(); return}
  const b = snap || addPt(q.x, q.y); const l = {id:nid('e'), t:'line', a, b}; if (s.construction) l.c2 = true; f.ents.push(l);
  if (!snap && q.hv) addCons(q.hv, [l.id]);
  const deg = f.ents.filter(x => x.t === 'line' || x.t === 'arc').filter(x => x.a === b || x.b === b).length;
  if (snap && (snap === s.chainStart || deg > 1 || snap === 'O' && deg > 1)) s.chain = null; else s.chain = b;
  s.draft = null; afterEdit(); return;
 }
 if (s.tool === 'rect'){
  if (!s.p1){s.p1 = snap ? Object.assign({id:snap}, P(snap)) : m; undoPop(); return}
  const a = s.p1, b = snap ? P(snap) : m; if (Math.abs(a.x-b.x) < 1e-6 || Math.abs(a.y-b.y) < 1e-6){undoPop(); return}
  const p1 = a.id || addPt(a.x, a.y), p2 = addPt(b.x, a.y), p3 = snap || addPt(b.x, b.y), p4 = addPt(a.x, b.y);
  const L = [[p1, p2], [p2, p3], [p3, p4], [p4, p1]].map(([x, y]) => {const l = {id:nid('e'), t:'line', a:x, b:y}; if (s.construction) l.c2 = true; f.ents.push(l); return l.id});
  addCons('horiz', [L[0]]); addCons('horiz', [L[2]]); addCons('vert', [L[1]]); addCons('vert', [L[3]]);
  s.p1 = null; s.draft = null; afterEdit(); return;
 }
 if (s.tool === 'circle'){
  if (!s.c){s.c = snap ? Object.assign({id:snap}, P(snap)) : m; undoPop(); return}
  const r = Math.hypot(m.x-s.c.x, m.y-s.c.y); if (r < 1e-6){undoPop(); return}
  const c = s.c.id || addPt(s.c.x, s.c.y); const ce = {id:nid('e'), t:'circle', c, r}; if (s.construction) ce.c2 = true; f.ents.push(ce);
  s.c = null; s.draft = null; afterEdit(); return;
 }
 if (s.tool === 'arc'){
  if (!s.c){s.c = snap ? Object.assign({id:snap}, P(snap)) : m; undoPop(); return}
  if (!s.a){s.a = snap ? Object.assign({id:snap}, P(snap)) : m; s.sweep = 0; s.lastAng = Math.atan2(s.a.y-s.c.y, s.a.x-s.c.x); undoPop(); return}
  const c = s.c, r = Math.hypot(s.a.x-c.x, s.a.y-c.y); if (Math.abs(s.sweep || 0) < 1e-3){undoPop(); return}
  const ang = Math.atan2(s.a.y-c.y, s.a.x-c.x) + s.sweep;
  const ci = c.id || addPt(c.x, c.y), ai = s.a.id || addPt(s.a.x, s.a.y), bi = snap || addPt(c.x + r*Math.cos(ang), c.y + r*Math.sin(ang));
  const arc = s.sweep > 0 ? {id:nid('e'), t:'arc', c:ci, a:ai, b:bi, r} : {id:nid('e'), t:'arc', c:ci, a:bi, b:ai, r};
  if (s.construction) arc.c2 = true; f.ents.push(arc);
  s.c = s.a = null; s.draft = null; s.sweep = 0; afterEdit(); return;
 }
}
function afterEdit(){const f = skf(); const r = solveSketch(f); if (!r.ok) S.sk.msg = 'Attention : l’esquisse ne peut pas satisfaire toutes ses relations.'; commit(false); S.sk.dofs = null; skUpdate(); renderUI()}
// --- cotation intelligente
function dimClick(m, e){
 const s = S.sk, f = skf(), h = hitAt(m);
 const k = h ? kindOf(f, h) : null;
 if (!s.dimPick){
  if (!h) return;
  if (k === 'circle' || k === 'arc'){const c = entOf(f, h); return newDim(k === 'circle' ? 'diam' : 'rad', [h], k === 'circle' ? 2*c.r : c.r)}
  s.dimPick = h; skDraw(); toast(k === 'line' ? 'Cliquez à côté pour la longueur, ou une 2e entité pour une distance ou un angle.' : 'Cliquez un 2e point ou une ligne.'); return;
 }
 const a = s.dimPick, ka = kindOf(f, a); s.dimPick = null;
 if (!h || h === a){if (ka === 'line'){const l = entOf(f, a), p = ptOf(f, l.a), q = ptOf(f, l.b); return newDim('len', [a], Math.hypot(q.x-p.x, q.y-p.y))} skDraw(); return}
 if (ka === 'pt' && k === 'pt'){const p = ptOf(f, ptId(f, a)), q = ptOf(f, ptId(f, h)); return newDim('dist', [a, h], Math.hypot(q.x-p.x, q.y-p.y), {choice:true})}
 const pl = ka === 'pt' && k === 'line' ? [a, h] : ka === 'line' && k === 'pt' ? [h, a] : null;
 if (pl){const p = ptOf(f, ptId(f, pl[0])), l = entOf(f, pl[1]), A = ptOf(f, l.a), B = ptOf(f, l.b); const d = Math.abs((B.x-A.x)*(A.y-p.y) - (A.x-p.x)*(B.y-A.y))/Math.hypot(B.x-A.x, B.y-A.y); return newDim('pl', pl, d)}
 if (ka === 'line' && k === 'line'){
  const l1 = entOf(f, a), l2 = entOf(f, h); const d1 = dirOf(f, l1), d2 = dirOf(f, l2);
  const cr = d1.x*d2.y - d1.y*d2.x, dt = d1.x*d2.x + d1.y*d2.y;
  if (Math.abs(cr) < 1e-6){const p = ptOf(f, l1.a), A = ptOf(f, l2.a), B = ptOf(f, l2.b); const d = Math.abs((B.x-A.x)*(A.y-p.y) - (A.x-p.x)*(B.y-A.y))/Math.hypot(B.x-A.x, B.y-A.y); return newDim('ll', [a, h], d)}
  const ang = Math.atan2(cr, dt)/DEG; return newDim('angle', [a, h], Math.abs(ang), {s:Math.sign(ang) || 1});
 }
 if ((ka === 'circle' || ka === 'arc' || k === 'circle' || k === 'arc')){
  const ids = [a, h].map(id => (kindOf(f, id) === 'circle' || kindOf(f, id) === 'arc') ? entOf(f, id).c : ptId(f, id));
  if (ids.every(x => x)){const p = ptOf(f, ids[0]), q = ptOf(f, ids[1]); return newDim('dist', ids, Math.hypot(q.x-p.x, q.y-p.y), {choice:true})}
 }
 skDraw();
}
const dirOf = (f, l) => {const a = ptOf(f, l.a), b = ptOf(f, l.b), n = Math.hypot(b.x-a.x, b.y-a.y) || 1; return {x:(b.x-a.x)/n, y:(b.y-a.y)/n}};
function newDim(t, e, v, o = {}){
 pushUndo(); const c = addCons(t, e, {v:+v.toFixed(4)}); if (o.s) c.s = o.s;
 const r = solveSketch(skf());
 if (!r.ok){skf().cons.pop(); undoPop(); toast('Cette cote surcontraint l’esquisse : elle n’a pas été ajoutée.', true); skDraw(); return}
 commit(false); S.sk.dofs = null; skUpdate(); renderUI(); openDimEdit(c, o.choice);
}
let dimEditing = null;
function openDimEdit(c, choice){
 closeDimEdit(); dimEditing = c;
 const el = document.createElement('div'); el.id = 'dimEdit';
 const unit = c.t === 'angle' ? '°' : 'mm';
 el.innerHTML = `${choice ? '<button data-dk="dist" title="Distance">↗</button><button data-dk="dx" title="Distance horizontale">↔</button><button data-dk="dy" title="Distance verticale">↕</button>' : ''}<input type="number" step="any" value="${c.v}" aria-label="Valeur de la cote (${unit})"><button data-ok>✓</button>`;
 $('#vpw').appendChild(el); placeDimEdit();
 const inp = el.querySelector('input'); inp.focus(); inp.select();
 const ok = () => {const v = parseFloat(String(inp.value).replace(',', '.')); if (!(v > 0) && !(c.t === 'dx' || c.t === 'dy') || !Number.isFinite(v)){toast('Entrez une valeur positive.', true); return} setDim(c, Math.abs(v)); closeDimEdit()};
 inp.addEventListener('keydown', ev => {if (ev.key === 'Enter'){ev.preventDefault(); ok()} if (ev.key === 'Escape'){ev.preventDefault(); closeDimEdit()} ev.stopPropagation()});
 el.querySelector('[data-ok]').onclick = ok;
 el.querySelectorAll('[data-dk]').forEach(b => b.onclick = () => {
  const f = skf(), p = ptOf(f, ptId(f, c.e[0])), q = ptOf(f, ptId(f, c.e[1]));
  const nt = b.dataset.dk, nv = nt === 'dist' ? Math.hypot(q.x-p.x, q.y-p.y) : nt === 'dx' ? Math.abs(q.x-p.x) : Math.abs(q.y-p.y);
  const old = {t:c.t, v:c.v, s:c.s}; c.t = nt; c.v = +nv.toFixed(4); c.s = nt === 'dx' ? Math.sign(q.x-p.x) || 1 : nt === 'dy' ? Math.sign(q.y-p.y) || 1 : undefined;
  if (!solveSketch(f).ok){Object.assign(c, old); toast('Impossible : cette cote surcontraindrait l’esquisse.', true)} inp.value = c.v; commit(false); S.sk.dofs = null; skUpdate();
 });
}
function placeDimEdit(){const el = $('#dimEdit'); if (!el || !dimEditing) return; const p = dimPos(dimEditing); if (p){el.style.left = p.x + 'px'; el.style.top = (p.y - 36) + 'px'}}
function closeDimEdit(){const el = $('#dimEdit'); if (el) el.remove(); dimEditing = null}
function setDim(c, v){
 const f = skf(), old = c.v; pushUndo(); c.v = v;
 const r = solveSketch(f);
 if (!r.ok){c.v = old; undoPop(); toast('Cette valeur est impossible avec les autres relations de l’esquisse.', true)} else commit(false);
 S.sk.dofs = null; skUpdate(); renderUI();
}
// --- relations
const REL = {coinc:'Coïncidente', mid:'Milieu', horiz:'Horizontale', vert:'Verticale', para:'Parallèle', perp:'Perpendiculaire', equal:'Égale', tangent:'Tangente', concentric:'Concentrique', fix:'Fixe',
 dist:'Cote', len:'Cote', pl:'Cote', ll:'Cote', dx:'Cote horizontale', dy:'Cote verticale', diam:'Cote Ø', rad:'Cote R', angle:'Cote angle'};
const GLYPH = {horiz:'H', vert:'V', para:'∥', perp:'⊥', equal:'=', tangent:'T', concentric:'◎', fix:'⚓', mid:'M', coinc:'●'};
function relOptions(){
 const f = skf(), ids = [...S.sk.sel], K = ids.map(id => kindOf(f, id));
 const n = t => K.filter(k => k === t).length, P = n('pt'), L = n('line'), C = n('circle') + n('arc'), N = ids.length;
 const o = [];
 if (N === 1 && L === 1) o.push('horiz', 'vert', 'fix');
 if (N === 2 && L === 2) o.push('para', 'perp', 'equal');
 if (N === 2 && P === 2) o.push('coinc', 'horiz', 'vert');
 if (N === 2 && P === 1 && L === 1) o.push('coinc', 'mid');
 if (N === 2 && P === 1 && C === 1) o.push('coinc');
 if (N === 2 && L === 1 && C === 1) o.push('tangent');
 if (N === 2 && C === 2) o.push('concentric', 'equal');
 if (N >= 1 && P === N) o.push('fix');
 if (N === 1 && C === 1) o.push('fix');
 if (N > 2 && L === N) o.push('horiz', 'vert', 'equal');
 return [...new Set(o)];
}
function addRelation(t){
 const ids = [...S.sk.sel]; pushUndo();
 if (t === 'equal' && ids.length > 2){for (let i = 1; i < ids.length; i++) addCons('equal', [ids[0], ids[i]])}
 else if ((t === 'horiz' || t === 'vert') && ids.length > 2) ids.forEach(id => addCons(t, [id]));
 else addCons(t, ids.map(id => t === 'fix' ? id : id));
 const r = solveSketch(skf());
 if (!r.ok){skf().cons = skf().cons.filter(c => !ids.length || !(c.t === t && c.e.every(x => ids.includes(x)))); undoPop(); toast('Cette relation est impossible ou surcontraint l’esquisse.', true); return}
 commit(false); S.sk.dofs = null; skUpdate(); renderUI();
}
function delCons(id){pushUndo(); const f = skf(); f.cons = f.cons.filter(c => c.id !== id); solveSketch(f); commit(false); S.sk.dofs = null; skUpdate(); renderUI()}
function deleteSel(){
 const s = S.sk, f = skf(); if (!s.sel.size) return; pushUndo();
 const del = new Set(s.sel);
 for (const id of s.sel){const c = f.cons.find(c => c.id === id); if (c) del.add(id)}
 for (const id of [...del]) if (f.pts[id]) f.ents.forEach(e => {if (e.a === id || e.b === id || e.c === id || e.p === id) del.add(e.id)});
 f.ents = f.ents.filter(e => !del.has(e.id));
 const used = new Set(); f.ents.forEach(e => [e.a, e.b, e.c, e.p].forEach(x => x && used.add(x)));
 for (const id of Object.keys(f.pts)) if (!used.has(id)) {delete f.pts[id]; del.add(id)}
 f.cons = f.cons.filter(c => !del.has(c.id) && c.e.every(x => !del.has(x)));
 s.sel.clear(); solveSketch(f); commit(false); s.dofs = null; skUpdate(); renderUI();
}
function toggleConstruction(){
 const s = S.sk, f = skf();
 const ents = [...s.sel].map(id => entOf(f, id)).filter(e => e && e.t !== 'point');
 if (!ents.length){s.construction = !s.construction; renderUI(); return}
 pushUndo(); const v = !ents.every(e => e.c2); ents.forEach(e => {if (v) e.c2 = true; else delete e.c2}); commit(false); skDraw(); renderUI();
}
// --- dessin de l'esquisse
function skUpdate(){const s = S.sk; if (!s) return; if (!s.dofs) s.dofs = analyseDof(skf()); skDraw(); status()}
function skDraw(){
 skGroup.clear(); const s = S.sk; if (!s) return req();
 const f = skf(), pl = planeOf(f), lift = pl.n.clone().multiplyScalar(0.02);
 const W = (u, v) => to3(pl, u, v).add(lift);
 const st = s.dofs || {free:new Set(), dof:0, conflict:false};
 const fullCol = dark() ? COL.fullDark : COL.full;
 const colOf = (id, ptsIds) => s.sel.has(id) ? COL.sel : s.hover === id ? COL.hov : st.conflict ? COL.err : (st.free.has(id) || (ptsIds || []).some(p => st.free.has(p))) ? COL.under : fullCol;
 const groups = {};
 const seg = (col, w, dashed, a, b) => {const k = col + '|' + w + '|' + dashed; (groups[k] = groups[k] || {col, w, dashed, pos:[]}).pos.push(...a.toArray(), ...b.toArray())};
 const poly = (col, w, dashed, pts) => {for (let i = 0; i < pts.length-1; i++) seg(col, w, dashed, pts[i], pts[i+1])};
 // origine et axes
 const ax = Math.max(wpp()*40, 1); seg(0xe5484d, 1.5, false, W(0, 0), W(ax, 0)); seg(0xe5484d, 1.5, false, W(0, 0), W(0, ax));
 for (const e of f.ents){
  const dash = !!e.c2;
  if (e.t === 'line'){const a = ptOf(f, e.a), b = ptOf(f, e.b); seg(dash && !s.sel.has(e.id) && s.hover !== e.id ? COL.constr : colOf(e.id, [e.a, e.b]), s.sel.has(e.id) ? 3 : 2, dash, W(a.x, a.y), W(b.x, b.y))}
  else if (e.t === 'circle' || e.t === 'arc'){
   const c = ptOf(f, e.c); let sa = 0, ea = 2*Math.PI; if (e.t === 'arc') [sa, ea] = arcAngles(f, e);
   const n = Math.max(24, Math.ceil((ea-sa)/(2*Math.PI)*96)), pts = []; for (let k = 0; k <= n; k++){const t = sa + (ea-sa)*k/n; pts.push(W(c.x + e.r*Math.cos(t), c.y + e.r*Math.sin(t)))}
   poly(dash && !s.sel.has(e.id) ? COL.constr : colOf(e.id, [e.c, e.a, e.b].filter(Boolean)), s.sel.has(e.id) ? 3 : 2, dash, pts);
  }
 }
 // aperçu de l'outil
 const d = s.draft;
 if (d){
  if (d.t === 'line') seg(COL.prev, 2, !!d.constr, W(d.a.x, d.a.y), W(d.b.x, d.b.y));
  if (d.t === 'rect'){const {a, b} = d; poly(COL.prev, 2, false, [W(a.x, a.y), W(b.x, a.y), W(b.x, b.y), W(a.x, b.y), W(a.x, a.y)])}
  if (d.t === 'circle'){const pts = []; for (let k = 0; k <= 64; k++){const t = k/64*2*Math.PI; pts.push(W(d.c.x + d.r*Math.cos(t), d.c.y + d.r*Math.sin(t)))} poly(COL.prev, 2, false, pts)}
  if (d.t === 'arc'){const pts = []; const n = 48; for (let k = 0; k <= n; k++){const t = d.a0 + d.sweep*k/n; pts.push(W(d.c.x + d.r*Math.cos(t), d.c.y + d.r*Math.sin(t)))} poly(COL.prev, 2, false, pts)}
 }
 for (const g of Object.values(groups)){const geo = new LineSegmentsGeometry().setPositions(g.pos); const l = new LineSegments2(geo, lmat(g.col, g.w, g.dashed)); if (g.dashed) l.computeLineDistances(); l.renderOrder = 5; skGroup.add(l)}
 // points
 const ptsByCol = {};
 const addP = (col, x, y, size) => {const k = col + '|' + size; (ptsByCol[k] = ptsByCol[k] || {col, size, pos:[]}).pos.push(...W(x, y).toArray())};
 addP(0xe5484d, 0, 0, 7);
 const used = new Set(); f.ents.forEach(e => [e.a, e.b, e.c].forEach(x => x && used.add(x)));
 for (const [id, p] of Object.entries(f.pts)){
  const pe = f.ents.find(e => e.t === 'point' && e.p === id); const sid = pe ? pe.id : id;
  addP(s.sel.has(sid) ? COL.sel : s.hover === sid || s.hover === id ? COL.hov : st.conflict ? COL.err : st.free.has(id) ? COL.under : fullCol, p.x, p.y, pe ? 8 : 6);
 }
 if (s.dimPick){const k = kindOf(f, s.dimPick); if (k === 'pt'){const p = ptOf(f, ptId(f, s.dimPick)); addP(COL.sel, p.x, p.y, 9)}}
 for (const g of Object.values(ptsByCol)){const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(g.pos, 3)); const pm = new THREE.Points(geo, new THREE.PointsMaterial({color:g.col, size:g.size, sizeAttenuation:false, depthTest:false})); pm.renderOrder = 6; skGroup.add(pm)}
 buildLabels(); req();
}
// --- étiquettes de cotes et de relations (HTML)
let labels = [];
function clearLabels(){labels.forEach(l => l.el.remove()); labels = []}
function dimPos(c){
 const f = skf(), pl = planeOf(f), P = id => ptOf(f, ptId(f, id)), E = id => entOf(f, id);
 let u, v, off = 14;
 switch (c.t){
  case 'len': {const l = E(c.e[0]), a = P(l.a), b = P(l.b); u = (a.x+b.x)/2; v = (a.y+b.y)/2; break}
  case 'dist': case 'dx': case 'dy': {const a = P(c.e[0]), b = P(c.e[1]); u = (a.x+b.x)/2; v = (a.y+b.y)/2; break}
  case 'pl': {const a = P(c.e[0]), l = E(c.e[1]), b = P(l.a); u = (a.x+b.x)/2; v = (a.y+b.y)/2; break}
  case 'll': {const l1 = E(c.e[0]), l2 = E(c.e[1]); const a = P(l1.a), b = P(l2.a); u = (a.x+b.x)/2; v = (a.y+b.y)/2; break}
  case 'diam': case 'rad': {const e = E(c.e[0]), ce = P(e.c); const t = e.t === 'arc' ? (arcAngles(f, e)[0] + arcAngles(f, e)[1])/2 : Math.PI/4; u = ce.x + e.r*Math.cos(t); v = ce.y + e.r*Math.sin(t); off = 0; break}
  case 'angle': {const l1 = E(c.e[0]), a = P(l1.a), b = P(l1.b); u = (a.x+b.x)/2; v = (a.y+b.y)/2; break}
  default: return null;
 }
 const p = to3(pl, u, v).project(camera); const r = vp.getBoundingClientRect();
 return {x:(p.x+1)/2*r.width, y:(1-p.y)/2*r.height - off};
}
function buildLabels(){
 clearLabels(); const s = S.sk; if (!s) return; const f = skf();
 for (const c of f.cons){
  if (['dist','len','pl','ll','dx','dy','diam','rad','angle'].includes(c.t)){
   const el = document.createElement('div'); el.className = 'lbl drv' + (s.sel.has(c.id) ? ' sel' : '');
   el.textContent = (c.t === 'diam' ? 'Ø' : c.t === 'rad' ? 'R' : c.t === 'dx' ? '↔ ' : c.t === 'dy' ? '↕ ' : '') + nfs(c.v) + (c.t === 'angle' ? '°' : '');
   el.title = 'Double-cliquez pour modifier'; el.addEventListener('dblclick', ev => {ev.stopPropagation(); openDimEdit(c)});
   el.addEventListener('click', ev => {ev.stopPropagation(); if (!(ev.ctrlKey || ev.shiftKey)) s.sel.clear(); s.sel.add(c.id); skDraw(); renderUI()});
   $('#vpw').appendChild(el); labels.push({el, c});
  } else if (S.showRel && GLYPH[c.t] && c.t !== 'coinc'){
   for (const id of c.e.slice(0, c.t === 'para' || c.t === 'perp' || c.t === 'equal' || c.t === 'tangent' || c.t === 'concentric' ? 2 : 1)){
    const el = document.createElement('div'); el.className = 'lbl rel'; el.textContent = GLYPH[c.t]; $('#vpw').appendChild(el); labels.push({el, rel:c, id});
   }
  }
 }
 placeLabels();
}
function placeLabels(){
 if (!S.sk){placeDimEdit(); return}
 const f = skf(), pl = planeOf(f), r = vp.getBoundingClientRect();
 const used = {};
 for (const L of labels){
  let p;
  if (L.c) p = dimPos(L.c);
  else {
   const id = L.id, k = kindOf(f, id); let u, v;
   if (k === 'line'){const l = entOf(f, id), a = ptOf(f, l.a), b = ptOf(f, l.b); u = (a.x+b.x)/2; v = (a.y+b.y)/2}
   else if (k === 'pt'){const q = ptOf(f, ptId(f, id)); u = q.x; v = q.y}
   else if (k === 'circle' || k === 'arc'){const e = entOf(f, id), c = ptOf(f, e.c); u = c.x; v = c.y + e.r}
   else continue;
   const q = to3(pl, u, v).project(camera); p = {x:(q.x+1)/2*r.width + 12, y:(1-q.y)/2*r.height + 10};
   const key = Math.round(p.x/10) + ',' + Math.round(p.y/10); used[key] = (used[key] || 0) + 1; p.x += (used[key]-1)*14;
  }
  if (!p){L.el.hidden = true; continue} L.el.hidden = false; L.el.style.left = p.x + 'px'; L.el.style.top = p.y + 'px';
 }
 placeDimEdit();
}

// =====================================================================
// Fonctions (PropertyManager)
// =====================================================================
function defaultSketch(){
 if (S.sel){const f = feat(S.sel); if (f && f.type === 'sketch') return f; if (f && f.sketch) return feat(f.sketch)}
 const free = S.doc.features.filter(f => f.type === 'sketch' && !consumers(f.id).length);
 return free[free.length - 1] || null;
}
function openFeature(type, sk){
 if (S.mode === 'sketch'){const cur = S.sk.f.id; S.sk.then = null; exitSketch(true); if (type === 'sketch') return; return openFeature(type, feat(cur))}
 if (type === 'sketch') return beginSketchCommand();
 if (type === 'hole' && !(sk && sk.type === 'sketch' && sk.ents.some(e => e.t === 'point'))){
  if (S.face && S.face.plane){const pl = S.face.plane; startSketch({o:pl.o.toArray(), x:pl.x.toArray(), n:pl.n.toArray(), label:'Face plane'}, 'hole'); S.sk.tool = 'point'; toast('Placez les centres des perçages (outil Point), cotez-les, puis validez ✓.'); renderUI(); return}
  toast('Cliquez d\u2019abord une face plane de la pièce, puis Perçage.'); return;
 }
 const needSketch = ['extrude', 'cut', 'revolve', 'rcut', 'hole'].includes(type);
 sk = sk || (needSketch ? defaultSketch() : null);
 if (needSketch && !sk){toast('Créez d’abord une esquisse (onglet Esquisse → Esquisse), ou sélectionnez-en une dans l’arbre.'); return}
 if (needSketch && consumers(sk.id).length){toast('Cette esquisse est déjà utilisée par ' + consumers(sk.id)[0].name + '. Créez une nouvelle esquisse.'); return}
 pushUndo(); const snap = JSON.stringify(S.doc);
 const f = {id:newId(), type, name:nextName(type)};
 if (needSketch) f.sketch = sk.id;
 if (type === 'extrude' || type === 'cut') Object.assign(f, {end:type === 'cut' ? 'through' : 'blind', depth:10, flip:false});
 if (type === 'revolve' || type === 'rcut'){const ax = sk.ents.find(e => e.t === 'line' && e.c2) || sk.ents.find(e => e.t === 'line'); Object.assign(f, {axis:ax ? ax.id : null, angle:360, flip:false})}
 if (type === 'fillet') Object.assign(f, {r:2, edges:[]});
 if (type === 'chamfer') Object.assign(f, {d:1, edges:[]});
 if (type === 'hole') Object.assign(f, {d:6.6, end:'through', depth:10, flip:false});
 const idx = needSketch ? S.doc.features.indexOf(sk) + 1 : S.doc.features.length;
 S.doc.features.splice(idx, 0, f);
 S.pm = {type, f, snap, isNew:true}; S.mode = 'feature'; clearFaceSel();
 rebuild(); renderUI();
}
function editFeature(f){
 if (f.type === 'sketch') return editSketch(f);
 pushUndo(); S.pm = {type:f.type, f, snap:JSON.stringify(S.doc), isNew:false}; S.mode = 'feature'; S.stopAt = null; rebuild(); renderUI();
}
let pmT = null;
function pmChanged(){clearTimeout(pmT); pmT = setTimeout(() => {rebuild(); renderUI()}, 120); renderUI()}
function pmOk(){
 const pm = S.pm; if (!pm) return;
 const r = S.res[pm.f.id]; if (r && !r.ok){toast('Corrigez d’abord : ' + r.err, true); return}
 S.pm = null; S.mode = 'idle'; S.sel = pm.f.id; commit(); showPlanes(false); renderUI();
}
function pmCancel(){
 const pm = S.pm; if (!pm) return; if (pm.snap) S.doc = JSON.parse(pm.snap); undoPop();
 S.pm = null; S.mode = 'idle'; showPlanes(false); rebuild(); renderUI();
}
function beginSketchCommand(){
 const sel = S.sel && BASE[S.sel] ? S.sel : null;
 if (sel) return startSketch({base:sel, offset:0});
 if (S.face && S.face.plane){const pl = S.face.plane; return startSketch({o:pl.o.toArray(), x:pl.x.toArray(), n:pl.n.toArray(), label:'Face plane'})}
 S.mode = 'pickPlane'; S.pm = {type:'pickPlane'}; showPlanes(true);
 if (!S.shape) stdView('iso'); renderUI();
}
function deleteFeature(f){
 if (f.type === 'sketch'){const c = consumers(f.id); if (c.length){toast('Cette esquisse est utilisée par ' + c[0].name + '. Supprimez d’abord cette fonction.', true); return}}
 pushUndo(); const del = new Set([f.id]); if (f.sketch && consumers(f.sketch).length === 1) del.add(f.sketch);
 S.doc.features = S.doc.features.filter(x => !del.has(x.id)); S.sel = null; commit(); rebuild(); renderUI();
}

// =====================================================================
// Annuler / Rétablir, enregistrement
// =====================================================================
function pushUndo(){S.undo.push(JSON.stringify(S.doc)); if (S.undo.length > 80) S.undo.shift(); S.redo = []}
function undoPop(){S.undo.pop()}
function commit(rb = true){LS.set('cao-modeleur', S.doc); if (CL.doc) CL.dirty = true; if (rb && S.mode !== 'sketch') rebuild()}
function undo(){
 if (!S.undo.length) return; S.redo.push(JSON.stringify(S.doc)); S.doc = JSON.parse(S.undo.pop()); afterHistory();
}
function redo(){if (!S.redo.length) return; S.undo.push(JSON.stringify(S.doc)); S.doc = JSON.parse(S.redo.pop()); afterHistory()}
function afterHistory(){
 LS.set('cao-modeleur', S.doc);
 if (S.mode === 'sketch'){const f = feat(S.sk.f.id); if (f){S.sk.f = f; S.sk.sel.clear(); S.sk.dofs = null; skUpdate(); renderUI(); return} S.mode = 'idle'; S.sk = null; skGroup.clear(); clearLabels()}
 if (S.pm && S.pm.f){const f = feat(S.pm.f.id); if (f) S.pm.f = f; else {S.pm = null; S.mode = 'idle'}}
 rebuild(); renderUI();
}
function download(blob, name){const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => {URL.revokeObjectURL(a.href); a.remove()}, 2000)}
const safeName = () => (S.doc.name || 'piece').replace(/[^\w\-àâäéèêëîïôöùûüç ]+/gi, '_').trim() || 'piece';

// =====================================================================
// Interface : CommandManager, panneau, barre d'état
// =====================================================================
const ICON = {
 sketch:'<path d="M4 20l4-1 11-11-3-3L5 16z M14 6l3 3"/>',
 extrude:'<path d="M5 15l7 4 7-4V9l-7-4-7 4z M5 9l7 4 7-4 M12 13v6"/><path d="M12 2v3" stroke-dasharray="2 2"/>',
 cut:'<path d="M5 15l7 4 7-4V9l-7-4-7 4z"/><path d="M9 11l3 2 3-2v-2l-3-2-3 2z" fill="currentColor" fill-opacity=".25"/>',
 revolve:'<path d="M12 3v18 M8 6a6 3 0 1 0 8 0"/><path d="M16 6l1-3 2 3"/>',
 rcut:'<path d="M12 3v18 M7 12a5 3 0 1 0 10 0a5 3 0 1 0-10 0"/>',
 fillet:'<path d="M4 20V10a6 6 0 0 1 6-6h10"/><path d="M4 4h4" stroke-dasharray="2 2"/>',
 chamfer:'<path d="M4 20V9l5-5h11"/>',
 hole:'<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="3"/>',
 select:'<path d="M5 3l14 9-6 1-3 6z"/>', line:'<path d="M4 20L20 4"/><circle cx="4" cy="20" r="1.6"/><circle cx="20" cy="4" r="1.6"/>', rect:'<rect x="4" y="6" width="16" height="12"/>',
 circle:'<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="1"/>', arc:'<path d="M4 18a8 8 0 0 1 16 0"/><circle cx="12" cy="18" r="1"/>', point:'<circle cx="12" cy="12" r="2.5" fill="currentColor"/>',
 constr:'<path d="M4 20L20 4" stroke-dasharray="3 3"/>', dim:'<path d="M3 17h18M3 13v8M21 13v8M7 17l-3-0M17 17h3"/><text x="12" y="10" font-size="8" text-anchor="middle" fill="currentColor" stroke="none">10</text>',
 del:'<path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13"/>', exit:'<path d="M4 12l5 5L20 6"/>', mass:'<circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 1 8 8h-8zM12 20a8 8 0 0 1-8-8h8z" fill="currentColor"/>',
 plane:'<path d="M3 8l6-4h12l-6 4z M3 8v12h12V8"/>', part:'<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/>', origin:'<path d="M12 4v16M4 12h16"/>', mat:'<path d="M4 7h16v10H4z M4 12h16"/>', err:'<circle cx="12" cy="12" r="9"/><path d="M8 8l8 8M16 8l-8 8"/>', cloud:'<path d="M7 18h10a4 4 0 0 0 .5-8A6 6 0 0 0 6 9.5 4.3 4.3 0 0 0 7 18z"/>'};
const svg = k => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICON[k] || ''}</svg>`;
function cmButtons(){
 const inSk = S.mode === 'sketch', s = S.sk;
 if (S.tab === 'fonctions') return [
  ['sketch', 'Esquisse', 'Esquisse : choisissez un plan ou une face plane'], '|',
  ['extrude', 'Bossage extrudé', 'Ajoute de la matière en extrudant une esquisse fermée'], ['revolve', 'Bossage avec révolution', 'Ajoute de la matière en faisant tourner une esquisse autour d’une ligne'],
  ['cut', 'Enlèvement de matière extrudé', 'Enlève de la matière en extrudant une esquisse fermée'], ['rcut', 'Enlèvement avec révolution', 'Enlève de la matière par révolution'], '|',
  ['fillet', 'Congé', 'Arrondit les arêtes choisies'], ['chamfer', 'Chanfrein', 'Casse les arêtes choisies'], ['hole', 'Perçage', 'Perce des trous sur une face plane']
 ].map(b => b === '|' ? '<span class="sep"></span>' : `<button class="tb" data-cmd="${b[0]}" title="${b[2]}">${svg(b[0])}<span class="lb">${b[1]}</span></button>`).join('');
 if (S.tab === 'esquisse'){
  if (!inSk) return `<button class="tb" data-cmd="sketch" title="Esquisse">${svg('sketch')}<span class="lb">Esquisse</span></button><span class="note" style="margin-left:8px">Créez une esquisse sur un plan ou une face plane pour dessiner.</span>`;
  return [['select', 'Sélection'], ['line', 'Ligne'], ['rect', 'Rectangle'], ['circle', 'Cercle'], ['arc', 'Arc'], ['point', 'Point'], '|', ['dim', 'Cotation intelligente'], '|', ['constr', 'Construction'], ['del', 'Supprimer'], '|', ['exit', 'Quitter l’esquisse']]
   .map(b => b === '|' ? '<span class="sep"></span>' : `<button class="tb" ${b[0] === 'constr' || b[0] === 'del' || b[0] === 'exit' ? `data-sk="${b[0]}"` : `data-tool="${b[0]}"`} aria-pressed="${s.tool === b[0] || (b[0] === 'constr' && s.construction)}" title="${b[1]}">${svg(b[0])}<span class="lb">${b[1]}</span></button>`).join('');
 }
 return `<button class="tb" data-cmd="mass" title="Propriétés de masse">${svg('mass')}<span class="lb">Propriétés de masse</span></button>`;
}
function renderUI(){
 document.querySelectorAll('.cmtabs button').forEach(b => b.setAttribute('aria-selected', b.dataset.tab === S.tab));
 $('#cmbar').innerHTML = cmButtons();
 $('#docName').value = S.doc.name;
 $('#side').innerHTML = S.mode === 'sketch' ? pmSketch() : S.pm ? pmFeature() : S.side === 'espace' ? cloudHTML() : treeHTML();
 const bc = $('#bCloud'); if (bc) bc.setAttribute('aria-pressed', S.side === 'espace');
 $('#bUndo').disabled = !S.undo.length; $('#bRedo').disabled = !S.redo.length;
 const corner = $('#corner');
 if (S.mode === 'sketch'){corner.hidden = false; corner.innerHTML = `<button class="ok" data-corner="ok" title="Quitter l'esquisse (enregistrer)">${svg('exit')}</button><button class="ko" data-corner="ko" title="Annuler les modifications de l'esquisse">${svg('err')}</button>`}
 else if (S.pm){corner.hidden = false; corner.innerHTML = `${S.pm.f ? `<button class="ok" data-corner="ok" title="Valider">${svg('exit')}</button>` : ''}<button class="ko" data-corner="ko" title="Annuler">${svg('err')}</button>`}
 else corner.hidden = true;
 $('#hint').textContent = S.mode === 'sketch' ? hintSketch() : S.pm && (S.pm.type === 'fillet' || S.pm.type === 'chamfer') ? 'Cliquez les arêtes à arrondir ou casser ; recliquez pour enlever.' : S.mode === 'pickPlane' ? 'Cliquez un plan (bleu) ou une face plane de la pièce.' : 'Molette : zoom · Clic molette ou clic gauche glissé : tourner · Ctrl + clic molette ou clic droit : déplacer';
 status();
}
function hintSketch(){
 const t = S.sk.tool; return {select:'Cliquez pour sélectionner (Ctrl : plusieurs) · glissez un point ou une ligne pour déformer l’esquisse.', line:'Cliquez le début puis chaque point ; double-clic, clic droit ou Échap pour terminer.', rect:'Cliquez deux coins opposés.', circle:'Cliquez le centre puis un point du cercle.', arc:'Cliquez le centre, le début de l’arc, puis sa fin.', point:'Cliquez pour placer un point.', dim:'Cliquez une entité (ou deux) ; tapez la valeur, puis Entrée.'}[t] || '';
}
function treeHTML(){
 const fs = S.doc.features, res = S.res;
 const mat = MATS.find(m => m[0] === S.doc.material);
 let h = `<ul class="tree" aria-label="Arbre de création">
  <li data-tsel="__part">${svg('part')}<span class="nm"><b>${esc(S.doc.name)}</b></span></li>
  <li data-tsel="__mat" class="${S.sel === '__mat' ? 'sel' : ''}">${svg('mat')}<span class="nm">Matériau &lt;${esc(mat && mat[0] ? mat[1] : 'non spécifié')}&gt;</span></li>
  ${Object.entries(BASE).map(([k, p]) => `<li data-tsel="${k}" class="${S.sel === k ? 'sel' : ''}">${svg('plane')}<span class="nm">${p.label}</span></li>`).join('')}
  <li>${svg('origin')}<span class="nm">Origine</span></li>`;
 const absorbed = new Set(fs.filter(f => f.sketch).map(f => f.sketch));
 for (const f of fs){
  if (f.type === 'sketch' && absorbed.has(f.id)) continue;
  const r = res[f.id], err = r && !r.ok, ghost = S.stopAt && fs.indexOf(f) >= fs.findIndex(x => x.id === S.stopAt);
  h += `<li data-tsel="${f.id}" class="${S.sel === f.id ? 'sel' : ''}${err ? ' err' : ''}${ghost ? ' ghost' : ''}" title="${err ? esc(r.err) : 'Double-cliquez pour modifier'}">${svg(err ? 'err' : f.type)}<span class="nm">${esc(f.name)}</span><button class="x" data-del="${f.id}" aria-label="Supprimer ${esc(f.name)}">${svg('del')}</button></li>`;
  if (f.sketch){const sk = feat(f.sketch); if (sk) h += `<li data-tsel="${sk.id}" class="sub${S.sel === sk.id ? ' sel' : ''}" title="Double-cliquez pour éditer l'esquisse">${svg('sketch')}<span class="nm">${esc(sk.name)}</span></li>`}
 }
 h += '</ul>';
 const nerr = Object.values(res).filter(r => !r.ok).length;
 h += `<div class="sec"><p>${fs.length ? `${fs.length} élément${fs.length > 1 ? 's' : ''} · reconstruit en ${Math.round(S.buildMs)} ms` : 'Commencez par une esquisse : onglet <b>Fonctions</b> → <b>Esquisse</b>, puis cliquez un plan.'}</p>
  ${nerr ? `<p class="msg-err">${nerr} fonction${nerr > 1 ? 's' : ''} en erreur : survolez-la dans l'arbre.</p>` : ''}
  <p class="note">Double-clic : modifier · Clic sur un plan ou une face, puis Esquisse.</p></div>`;
 if (S.sel === '__mat' || S.tab === 'evaluer') h += massHTML();
 return h;
}
function massHTML(){
 let h = `<div class="sec"><h3>Propriétés de masse</h3><label class="f" for="matSel">Matériau</label><select id="matSel">${MATS.map(([id, n, r]) => `<option value="${id}"${S.doc.material === id ? ' selected' : ''}>${n}${r ? ' · ' + r.toLocaleString('fr-FR') + ' kg/m³' : ''}</option>`).join('')}</select>`;
 if (!S.shape) return h + '<p>Aucune pièce pour l’instant.</p></div>';
 try {
  const vp_ = R.measureShapeVolumeProperties(S.shape), sp = R.measureShapeSurfaceProperties(S.shape);
  const V = vp_.volume, G = vp_.centerOfMass, A = sp.area; const rho = (MATS.find(m => m[0] === S.doc.material) || [0, 0, 0])[2];
  const m = rho*V*1e-6; const b = S.shape.boundingBox;
  h += kv([['Masse', rho ? (m >= 1000 ? nf(m/1000, 3) + ' kg' : nf(m) + ' g') : '—', 1], ['Poids P = m·g', rho ? nf(m*1e-3*9.81, 3) + ' N' : '—'], ['Volume', nf(V) + ' mm³'], ['Aire', nf(A) + ' mm²'],
   ['G · X', nf(G[0]) + ' mm'], ['G · Y', nf(G[1]) + ' mm'], ['G · Z', nf(G[2]) + ' mm'], ['Encombrement', nf(b.width, 1) + ' × ' + nf(b.height, 1) + ' × ' + nf(b.depth, 1) + ' mm']]);
  if (!rho) h += '<p class="note">Choisissez un matériau pour obtenir la masse.</p>';
 } catch (e){h += '<p class="msg-err">Calcul impossible.</p>'}
 return h + '</div>';
}
const kv = rows => '<dl class="kv">' + rows.map(([k, v, b]) => `<dt>${esc(k)}</dt><dd${b ? ' class="big"' : ''}>${esc(v)}</dd>`).join('') + '</dl>';
function pmSketch(){
 const s = S.sk, f = skf(), st = s.dofs || {dof:0};
 let h = `<div class="pm-h">${svg('sketch')}<span class="t">${esc(f.name)}</span></div>`;
 h += `<div class="sec"><p>Sur : <b>${esc(planeOf(f).label)}</b></p><p>Outil : <b>${TOOLS[s.tool]}</b>${s.construction ? ' · construction' : ''}</p><p>${esc(hintSketch())}</p>${s.msg ? `<p class="msg-err">${esc(s.msg)}</p>` : ''}</div>`;
 if (s.sel.size){
  const opts = relOptions();
  h += `<div class="sec"><h3>Ajouter des relations</h3>${opts.length ? `<div class="chips">${opts.map(o => `<button class="tb" data-rel="${o}">${GLYPH[o] ? `<b>${GLYPH[o]}</b>` : ''} ${REL[o]}</button>`).join('')}</div>` : '<p>Aucune relation pour cette sélection. Sélectionnez 1 ou 2 entités.</p>'}</div>`;
  const ids = [...s.sel]; const ex = f.cons.filter(c => c.e.some(x => ids.includes(x)) || ids.includes(c.id));
  h += `<div class="sec"><h3>Relations existantes</h3>${ex.length ? ex.map(c => `<div class="rel"><span>${GLYPH[c.t] ? GLYPH[c.t] + ' ' : ''}${REL[c.t] || c.t}${c.v != null ? ' · ' + nfs(c.v) + (c.t === 'angle' ? '°' : ' mm') : ''}</span><button data-delcons="${c.id}" aria-label="Supprimer la relation">${svg('del')}</button></div>`).join('') : '<p>Aucune.</p>'}</div>`;
  const ents = ids.map(id => entOf(f, id)).filter(e => e && e.t !== 'point');
  if (ents.length) h += `<div class="sec"><label class="chk"><input type="checkbox" id="c2chk" ${ents.every(e => e.c2) ? 'checked' : ''}> Pour construction (n'est pas un contour : sert d'axe)</label></div>`;
 }
 h += `<div class="sec"><label class="chk"><input type="checkbox" id="relChk" ${S.showRel ? 'checked' : ''}> Afficher les relations</label></div>`;
 return h;
}
function pmFeature(){
 const pm = S.pm;
 if (pm.type === 'pickPlane') return `<div class="pm-h">${svg('sketch')}<span class="t">Esquisse</span></div><div class="sec"><p>Sélectionnez le plan de l'esquisse :</p><div class="chips">${Object.entries(BASE).map(([k, p]) => `<button class="tb" data-plane="${k}">${p.label}</button>`).join('')}</div><p class="note">…ou cliquez un plan bleu ou une face plane de la pièce dans la zone graphique.</p></div>`;
 const f = pm.f, r = S.res[f.id] || {ok:true}, sk = f.sketch ? feat(f.sketch) : null;
 let h = `<div class="pm-h">${svg(f.type)}<span class="t">${esc(f.name)}</span></div>`;
 if (!r.ok) h += `<div class="sec"><p class="msg-err">${esc(r.err)}</p></div>`;
 const num = (id, label, v, unit = 'mm', min = 0.001) => `<label class="f" for="${id}">${label} (${unit})</label><input type="number" id="${id}" data-fp="${id}" step="any" min="${min}" value="${v}">`;
 if (f.type === 'extrude' || f.type === 'cut'){
  h += `<div class="sec"><h3>Esquisse</h3><p>${esc(sk ? sk.name : '?')}</p><div class="row"><button class="tb" data-editsk="${f.sketch}">Éditer l'esquisse</button></div></div>`;
  h += `<div class="sec"><h3>Direction 1</h3><label class="f" for="end">Condition de fin</label><select id="end" data-fp="end"><option value="blind"${f.end === 'blind' ? ' selected' : ''}>Borgne</option><option value="mid"${f.end === 'mid' ? ' selected' : ''}>Plan milieu</option>${f.type === 'cut' ? `<option value="through"${f.end === 'through' ? ' selected' : ''}>À travers tout</option>` : ''}</select>`;
  if (f.end !== 'through') h += num('depth', 'Profondeur D1', f.depth);
  if (f.end === 'blind') h += `<label class="chk"><input type="checkbox" data-fp="flip" ${f.flip ? 'checked' : ''}> Inverser la direction</label>`;
  h += '</div>';
 }
 if (f.type === 'revolve' || f.type === 'rcut'){
  const lines = sk ? sk.ents.filter(e => e.t === 'line') : [];
  h += `<div class="sec"><h3>Axe de révolution</h3><select id="axis" data-fp="axis">${lines.map((l, i) => `<option value="${l.id}"${f.axis === l.id ? ' selected' : ''}>${l.c2 ? 'Ligne de construction' : 'Ligne'} ${i + 1}</option>`).join('')}</select><p class="note">Conseil : tracez l'axe en ligne de construction (pointillés) dans l'esquisse.</p>
   <div class="row"><button class="tb" data-editsk="${f.sketch}">Éditer l'esquisse</button></div></div>`;
  h += `<div class="sec"><h3>Direction 1</h3>${num('angle', 'Angle', f.angle, '°', 0.1)}<label class="chk"><input type="checkbox" data-fp="flip" ${f.flip ? 'checked' : ''}> Inverser la direction</label></div>`;
 }
 if (f.type === 'fillet' || f.type === 'chamfer'){
  h += `<div class="sec"><h3>${f.type === 'fillet' ? 'Paramètres du congé' : 'Paramètres du chanfrein'}</h3>${f.type === 'fillet' ? num('r', 'Rayon', f.r) : num('d', 'Distance', f.d)}</div>`;
  h += `<div class="sec"><h3>Arêtes</h3><p><b>${f.edges.length}</b> arête${f.edges.length > 1 ? 's' : ''} sélectionnée${f.edges.length > 1 ? 's' : ''}. Cliquez-les dans la zone graphique.</p>${f.edges.length ? '<div class="row"><button class="tb" id="clrEdges">Tout désélectionner</button></div>' : ''}</div>`;
 }
 if (f.type === 'hole'){
  const n = sk ? sk.ents.filter(e => e.t === 'point').length : 0;
  h += `<div class="sec"><h3>Perçage simple</h3>${num('d', 'Diamètre', f.d)}<label class="f" for="end">Condition de fin</label><select id="end" data-fp="end"><option value="through"${f.end === 'through' ? ' selected' : ''}>À travers tout</option><option value="blind"${f.end === 'blind' ? ' selected' : ''}>Borgne</option></select>${f.end === 'blind' ? num('depth', 'Profondeur', f.depth) + `<label class="chk"><input type="checkbox" data-fp="flip" ${f.flip ? 'checked' : ''}> Inverser la direction</label>` : ''}</div>
   <div class="sec"><h3>Emplacements</h3><p>${n} point${n > 1 ? 's' : ''} dans ${esc(sk ? sk.name : '?')}.</p><div class="row"><button class="tb" data-editsk="${f.sketch}">Modifier les emplacements</button></div><p class="note">Cotez les points dans l'esquisse pour les placer précisément.</p></div>`;
 }
 return h;
}
function status(){
 let h = '';
 if (S.mode === 'sketch'){
  const st = S.sk.dofs; const m = S.sk.mouse;
  if (st) h += st.conflict ? '<span class="st-over"><b>Esquisse surcontrainte ou impossible</b></span>' : st.dof === 0 ? '<span class="st-full"><b>Totalement contrainte</b></span>' : `<span class="st-under"><b>Sous-contrainte</b> · ${st.dof} degré${st.dof > 1 ? 's' : ''} de liberté</span>`;
  if (m) h += `<span>x ${nf(m.x)} · y ${nf(m.y)} mm</span>`;
  h += '<span>Bleu : encore libre · Noir : totalement défini</span>';
 } else {
  h += `<span>${esc(S.doc.name)}</span>`;
  if (CL.doc) h += `<span class="${CL.doc.edit ? 'msg-ok' : 'msg-err'}">Espace : ${esc(CL.doc.groupe_nom)} · v${CL.doc.version}${CL.dirty ? ' · non enregistré' : ''}${CL.doc.edit ? '' : ' · lecture seule'}</span>`;
  if (S.shape) try {h += `<span>Volume ${nf(R.measureVolume(S.shape))} mm³</span>`} catch(e){}
  h += '<span>Unités : mm</span>';
 }
 $('#status').innerHTML = h;
}
let toastT = null;
function toast(t, err){const el = $('#status'); status(); el.insertAdjacentHTML('afterbegin', `<span class="${err ? 'msg-err' : 'msg-ok'}"><b>${esc(t)}</b></span>`); clearTimeout(toastT); toastT = setTimeout(status, 5000)}
function modal(html, actions){
 const m = $('#modal'); m.hidden = false; m.innerHTML = `<div role="dialog" aria-modal="true">${html}<div class="row" style="justify-content:flex-end;margin-top:14px">${actions.map((a, i) => `<button class="tb${a.primary ? ' primary' : ''}" data-mi="${i}">${esc(a.label)}</button>`).join('')}</div></div>`;
 m.querySelectorAll('[data-mi]').forEach(b => b.onclick = () => {m.hidden = true; const a = actions[+b.dataset.mi]; a.fn && a.fn()});
}

// =====================================================================
// Événements
// =====================================================================
document.querySelector('.cmtabs').addEventListener('click', e => {const b = e.target.closest('[data-tab]'); if (!b) return; S.tab = b.dataset.tab; if (S.tab === 'evaluer' && S.mode === 'idle') S.sel = '__mat'; renderUI()});
$('#cmbar').addEventListener('click', e => {
 const b = e.target.closest('button'); if (!b) return; const d = b.dataset;
 if (d.cmd === 'mass'){S.sel = '__mat'; if (S.mode !== 'idle' && S.mode !== 'feature') return; renderUI(); return}
 if (d.cmd){if (S.pm && S.pm.f) pmCancel(); if (S.mode === 'pickPlane'){S.pm = null; S.mode = 'idle'; showPlanes(false)} openFeature(d.cmd); return}
 if (d.tool) setTool(d.tool);
 if (d.sk === 'constr') toggleConstruction();
 if (d.sk === 'del') deleteSel();
 if (d.sk === 'exit') exitSketch(true);
});
$('#corner').addEventListener('click', e => {
 const b = e.target.closest('[data-corner]'); if (!b) return; const ok = b.dataset.corner === 'ok';
 if (S.mode === 'sketch') exitSketch(ok);
 else if (S.pm){if (S.pm.type === 'pickPlane'){S.pm = null; S.mode = 'idle'; showPlanes(false); renderUI()} else ok ? pmOk() : pmCancel()}
});
$('#side').addEventListener('click', e => {
 const t = e.target.closest('button,[data-tsel]'); if (!t) return; const d = t.dataset;
 if (d.del){e.stopPropagation(); const f = feat(d.del); if (f) modal(`<h3>Supprimer « ${esc(f.name)} » ?</h3><p>${f.sketch ? 'Son esquisse sera supprimée aussi.' : ''} Vous pourrez annuler avec Ctrl + Z.</p>`, [{label:'Annuler'}, {label:'Supprimer', primary:true, fn:() => deleteFeature(f)}]); return}
 if (d.tsel){const was = S.sel; S.sel = d.tsel === '__part' ? null : d.tsel; clearFaceSel(); if (S.sel === '__mat' || was === '__mat') renderUI(); else document.querySelectorAll('#side [data-tsel]').forEach(li => li.classList.toggle('sel', li.dataset.tsel === S.sel)); highlightSel(); return}
 if (d.plane) return startSketch({base:d.plane, offset:0});
 if (d.rel) return addRelation(d.rel);
 if (d.delcons) return delCons(d.delcons);
 if (d.editsk){const sk = feat(d.editsk); const pm = S.pm; if (pm && pm.f){S.pm = null; S.mode = 'idle'; commit(); editSketch(sk)} return}
 if (t.id === 'clrEdges'){S.pm.f.edges = []; pmChanged()}
});
$('#side').addEventListener('dblclick', e => {const li = e.target.closest('[data-tsel]'); if (!li) return; const f = feat(li.dataset.tsel); if (f) editFeature(f); else if (BASE[li.dataset.tsel]) startSketch({base:li.dataset.tsel, offset:0})});
$('#side').addEventListener('change', e => {
 const t = e.target;
 if (t.id === 'matSel'){pushUndo(); S.doc.material = t.value; commit(false); renderUI(); return}
 if (t.id === 'relChk'){S.showRel = t.checked; buildLabels(); return}
 if (t.id === 'c2chk'){toggleConstruction(); return}
 const k = t.dataset.fp; if (!k || !S.pm) return;
 const f = S.pm.f;
 if (t.type === 'checkbox') f[k] = t.checked;
 else if (t.type === 'number'){const v = parseFloat(String(t.value).replace(',', '.')); if (Number.isFinite(v) && v > 0) f[k] = v; else {toast('Entrez une valeur positive.', true); return}}
 else f[k] = t.value;
 pmChanged();
});
$('#side').addEventListener('input', e => {const t = e.target; if (t.type === 'number' && t.dataset.fp && S.pm){const v = parseFloat(String(t.value).replace(',', '.')); if (Number.isFinite(v) && v > 0){S.pm.f[t.dataset.fp] = v; clearTimeout(pmT); pmT = setTimeout(() => {rebuild(); const a = document.activeElement && document.activeElement.id; renderUI(); if (a){const el = document.getElementById(a); if (el){el.focus(); try {el.setSelectionRange(el.value.length, el.value.length)} catch(x){}}}}, 450)}}});
function highlightSel(){
 skGroup.clear(); const f = S.sel && feat(S.sel);
 if (f && f.type === 'sketch'){
  const pos = sketchSegs(f);
  if (pos.length){const l = new LineSegments2(new LineSegmentsGeometry().setPositions(pos), lmat(0x12c2e9, 3)); l.renderOrder = 5; skGroup.add(l)}
 }
 if (BASE[S.sel]){showPlanes(true); planeGroup.children.forEach(o => {if (o.userData.base && o.userData.base !== S.sel) o.visible = false; if (!o.userData.base) o.visible = false})} else if (S.mode !== 'pickPlane') showPlanes(false);
 drawFree();
}
$('#docName').addEventListener('change', e => {pushUndo(); S.doc.name = e.target.value.trim() || 'Pièce1'; commit(false); renderUI()});
$('#bUndo').onclick = undo;
$('#bCloud').onclick = () => {if (S.side === 'espace'){S.side = null; renderUI()} else {if (S.mode !== 'idle'){toast('Terminez d’abord l’esquisse ou la fonction en cours.', true); return} cloudOpen()}}; $('#bRedo').onclick = redo;
$('#bNew').onclick = () => modal('<h3>Nouvelle pièce ?</h3><p>La pièce actuelle sera remplacée. Pensez à l’enregistrer avant (bouton Enregistrer), ou annulez ensuite avec Ctrl + Z.</p>', [{label:'Annuler'}, {label:'Nouvelle pièce', primary:true, fn:() => {cloudClose(true); pushUndo(); leaveModes(); S.doc = newDoc(); commit(); stdView('iso'); renderUI()}}]);
$('#bExample').onclick = () => modal('<h3>Charger la pièce d’exemple ?</h3><p>Un support percé avec congés, construit fonction par fonction. La pièce actuelle sera remplacée (Ctrl + Z pour revenir).</p>', [{label:'Annuler'}, {label:'Charger', primary:true, fn:() => {cloudClose(true); pushUndo(); leaveModes(); S.doc = exampleDoc(); commit(); stdView('iso'); renderUI()}}]);
$('#bSave').onclick = async () => {if (CL.doc && CL.doc.edit){try {await cloudSave()} catch (e){toast(e.message, true)} renderUI(); return} download(new Blob([JSON.stringify(S.doc, null, 1)], {type:'application/json'}), safeName() + '.cao.json')};
$('#bOpen').onclick = () => $('#file').click();
$('#file').onchange = async e => {
 const file = e.target.files[0]; e.target.value = ''; if (!file) return;
 try {const d = JSON.parse(await file.text()); if (d.format !== 'techno-hangar-cao' || !Array.isArray(d.features)) throw new Error(); pushUndo(); leaveModes(); S.doc = d; commit(); stdView('iso'); renderUI()}
 catch (err){toast('Ce fichier n’est pas une pièce du modeleur (.cao.json).', true)}
};
$('#bStep').onclick = () => {if (!S.shape) return toast('Aucune pièce à exporter.', true); try {download(S.shape.blobSTEP(), safeName() + '.step')} catch(e){toast('Export STEP impossible.', true)}};
$('#bStl').onclick = () => {if (!S.shape) return toast('Aucune pièce à exporter.', true); try {download(S.shape.blobSTL({binary:true, tolerance:0.01, angularTolerance:0.1}), safeName() + '.stl')} catch(e){toast('Export STL impossible.', true)}};
function leaveModes(){S.mode = 'idle'; S.sk = null; S.pm = null; S.stopAt = null; S.sel = null; skGroup.clear(); clearLabels(); closeDimEdit(); showPlanes(false); clearFaceSel()}
addEventListener('keydown', e => {
 if (e.target.closest && e.target.closest('input,select,textarea')) return;
 if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z'){e.preventDefault(); undo(); return}
 if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y'){e.preventDefault(); redo(); return}
 if (e.ctrlKey || e.metaKey || e.altKey) return;
 if (S.mode === 'sketch'){
  if (e.key === 'Escape'){const s = S.sk; if (s.chain || s.p1 || s.c || s.dimPick) skEndChain(); else if (s.tool !== 'select') setTool('select'); else {s.sel.clear(); skDraw(); renderUI()} s.dimPick = null; return}
  if (e.key === 'Delete' || e.key === 'Backspace'){deleteSel(); return}
 } else if (e.key === 'Escape'){if (S.pm) pmCancel(); else {S.sel = null; clearFaceSel(); renderUI(); highlightSel()} return}
 else if (e.key === 'Enter' && S.pm && S.pm.f){pmOk(); return}
 else if ((e.key === 'Delete') && S.sel && feat(S.sel)){const f = feat(S.sel); modal(`<h3>Supprimer « ${esc(f.name)} » ?</h3>`, [{label:'Annuler'}, {label:'Supprimer', primary:true, fn:() => deleteFeature(f)}]); return}
 const k = Object.keys(VIEWS).find(v => VIEWS[v][1] === e.key);
 if (k){stdView(k); req()} else if (e.key === '8'){normalToCurrent(); req()} else if (e.key === 'f' || e.key === 'F'){fit(); req()}
});


// =====================================================================
// Espace partagé (Supabase de Techno-Hangar) : groupes, bibliothèque, verrou, versions, corbeille
// =====================================================================
const CL = {gp:null, client:null, err:null, loading:false, esp:null, space:undefined, trash:false, list:null, doc:null, hb:null, versions:null, dirty:false};
function loadScript(src){return new Promise((ok, ko) => {const t = document.createElement('script'); t.src = src; t.onload = ok; t.onerror = () => ko(new Error('script')); document.head.appendChild(t)})}
async function cloudInit(){
 if (CL.client) return CL.client;
 let cfg = LS.get('cao-supabase');
 if (!cfg){
  try {const t = await (await fetch('../assets/config.js', {cache:'no-store'})).text();
   const url = (t.match(/https:\/\/[a-z0-9]+\.supabase\.co/) || [])[0], key = (t.match(/sb_publishable_[A-Za-z0-9_\-]+/) || t.match(/eyJ[\w-]+\.[\w-]+\.[\w-]+/) || [])[0];
   if (url && key) cfg = {url, key};
  } catch (e){}
 }
 if (!cfg) throw new Error('config');
 if (!window.supabase) await loadScript('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.119.0/dist/umd/supabase.js');
 const c = window.supabase.createClient(cfg.url, cfg.key);
 const {data} = await c.auth.getSession(); if (!data || !data.session) throw new Error('session');
 return CL.client = c;
}
async function rpc(fn, args = {}){const {data, error} = await CL.client.rpc(fn, args); if (error) throw new Error(error.message); return data}
async function cloudOpen(){
 S.side = 'espace'; CL.err = null; CL.loading = true; renderUI();
 try {await cloudInit(); CL.esp = await rpc('cao_mes_espaces'); if (CL.esp && CL.esp.erreur) throw new Error(CL.esp.erreur); if (CL.space !== undefined) await cloudList()}
 catch (e){CL.err = e.message}
 CL.loading = false; renderUI();
}
const myGroups = () => (CL.esp && CL.esp.groupes || []).filter(g => g.moi);
const canWrite = gid => !!CL.esp && (CL.esp.prof || (gid && CL.esp.ouvert && myGroups().some(g => g.id === gid)));
async function cloudList(){CL.list = await rpc('cao_liste', {p_groupe:CL.space, p_corbeille:CL.trash})}
async function cloudAct(fn){try {await fn()} catch (e){toast(e.message || 'Erreur de l’espace partagé', true)} renderUI()}
async function cloudOpenDoc(id){
 if (CL.dirty && CL.doc && CL.doc.edit){toast('Enregistrez d’abord la pièce ouverte (bouton Enregistrer).', true); return}
 await cloudClose(true);
 const d = await rpc('cao_lire', {p_doc:id});
 leaveModes(); S.doc = d.recette && d.recette.features ? d.recette : newDoc(d.nom); S.doc.name = d.nom; S.undo = []; S.redo = [];
 CL.doc = {id:d.id, nom:d.nom, groupe:d.groupe, groupe_nom:d.groupe_nom || 'Bibliothèque', version:d.version, edit:false, why:''};
 if (d.ecriture){const l = await rpc('cao_verrouiller', {p_doc:id}); if (l.ok){CL.doc.edit = true; startHb()} else CL.doc.why = l.raison === 'verrou' ? 'En cours de modification par ' + l.par : 'Lecture seule'}
 else CL.doc.why = d.groupe ? 'Lecture seule (autre groupe ou hors horaires)' : 'Bibliothèque : lecture seule';
 CL.dirty = false; LS.set('cao-modeleur', S.doc); rebuild(); stdView('iso'); renderUI();
}
function startHb(){clearInterval(CL.hb); CL.hb = setInterval(async () => {if (!CL.doc || !CL.doc.edit) return; try {const l = await rpc('cao_verrouiller', {p_doc:CL.doc.id}); if (!l.ok){CL.doc.edit = false; CL.doc.why = 'Verrou perdu'; renderUI()}} catch (e){}}, 120000)}
async function cloudClose(silent){
 clearInterval(CL.hb); const d = CL.doc; CL.doc = null; CL.versions = null; CL.dirty = false;
 if (d && d.edit) try {await rpc('cao_liberer', {p_doc:d.id})} catch (e){}
 if (!silent) renderUI();
}
async function cloudSave(){
 if (!CL.doc || !CL.doc.edit) return false;
 const r = await rpc('cao_enregistrer', {p_doc:CL.doc.id, p_recette:S.doc, p_nom:S.doc.name});
 if (!r.ok){CL.doc.edit = false; CL.doc.why = r.raison === 'verrou' ? 'En cours de modification par ' + r.par : 'Enregistrement refusé (horaires ?)'; toast(CL.doc.why, true); return true}
 CL.doc.version = r.version; CL.doc.nom = S.doc.name; CL.dirty = false; toast('Enregistré dans l’espace · version ' + r.version);
 if (CL.space !== undefined) await cloudList(); return true;
}
async function cloudSaveAs(gid){
 const id = await rpc('cao_creer', {p_groupe:gid, p_nom:S.doc.name || 'Pièce', p_type:'piece', p_recette:S.doc});
 await cloudList(); CL.esp = await rpc('cao_mes_espaces'); await cloudOpenDoc(id); toast('Pièce enregistrée dans l’espace.');
}
function cloudHTML(){
 let h = `<div class="pm-h">${svg('cloud')}<span class="t">Espace de travail</span><button class="ko" data-cl="close" title="Revenir à l'arbre de création">${svg('err')}</button></div>`;
 if (CL.loading) return h + '<div class="sec"><p>Chargement…</p></div>';
 if (CL.err){
  const m = CL.err === 'config' ? 'Ouvrez le modeleur depuis votre site Techno-Hangar (dossier <b>cao/</b>) pour utiliser l’espace partagé.' : CL.err === 'session' ? 'Connectez-vous d’abord au site Techno-Hangar, puis revenez ici.' : CL.err === 'script' ? 'La connexion au serveur n’a pas pu se charger (réseau filtré ?).' : esc(CL.err);
  return h + `<div class="sec"><p class="msg-err">${m}</p>${CL.err === 'session' ? '<div class="row"><a class="tb" href="../connexion/" style="color:inherit">Se connecter</a></div>' : ''}<div class="row"><button class="tb" data-cl="retry">Réessayer</button></div></div>`;
 }
 if (CL.doc){
  const d = CL.doc;
  h += `<div class="sec"><h3>Document ouvert</h3><p><b>${esc(d.nom)}</b> · ${esc(d.groupe_nom)} · version ${d.version}${CL.dirty ? ' · <span class="msg-err">non enregistré</span>' : ''}</p>
   <p class="${d.edit ? 'msg-ok' : 'msg-err'}">${d.edit ? 'Vous pouvez modifier (verrouillé pour vous).' : esc(d.why)}</p>
   <div class="row">${d.edit ? '<button class="tb primary" data-cl="save">Enregistrer</button>' : ''}<button class="tb" data-cl="versions">Versions</button>${!d.edit && myGroups().length ? '<button class="tb" data-cl="copycur">Copier dans mon groupe</button>' : ''}<button class="tb" data-cl="closedoc">Fermer</button></div>`;
  if (CL.versions) h += '<div style="margin-top:8px">' + CL.versions.map(v => `<div class="rel"><span>v${v.numero} · ${esc(v.auteur || '?')} · ${new Date(v.le).toLocaleString('fr-FR', {dateStyle:'short', timeStyle:'short'})}</span>${d.edit && v.numero !== d.version ? `<button data-cl="restore" data-n="${v.numero}" title="Revenir à cette version" aria-label="Revenir à la version ${v.numero}">↺</button>` : ''}</div>`).join('') + '</div>';
  h += '</div>';
 }
 const e = CL.esp || {groupes:[]};
 h += `<div class="sec"><h3>Espaces</h3>${!e.prof && !e.ouvert ? '<p class="msg-err">Hors des horaires d’ouverture : lecture seule.</p>' : ''}<ul class="tree" style="padding:0">`;
 for (const g of e.groupes) h += `<li data-cl="space" data-g="${g.id}" class="${CL.space === g.id ? 'sel' : ''}">${svg('part')}<span class="nm">${esc(g.nom)}${e.prof ? ' · ' + esc(g.classe) : ''}<br><small style="color:var(--mute)">${e.prof ? 'Accès professeur' : g.moi ? 'Mon groupe' : 'Lecture seule'} · ${esc((g.membres || []).join(', ') || 'aucun membre')}</small></span><span class="badge">${g.documents}</span></li>`;
 h += `<li data-cl="space" data-g="" class="${CL.space === null ? 'sel' : ''}">${svg('mat')}<span class="nm">Bibliothèque du prof<br><small style="color:var(--mute)">${e.prof ? 'Vous seul écrivez ici' : 'Modèles à copier dans votre groupe'}</small></span><span class="badge">${e.bibliotheque || 0}</span></li></ul>`;
 if (!e.groupes.length && !e.prof) h += '<p>Vous n’êtes dans aucun groupe pour l’instant : demandez à votre professeur.</p>';
 h += '</div>';
 if (CL.space !== undefined && CL.list){
  const w = canWrite(CL.space) || (CL.space === null && e.prof);
  h += `<div class="sec"><h3>${CL.trash ? 'Corbeille' : 'Documents'}</h3>`;
  h += CL.list.length ? CL.list.map(d => `<div class="rel" style="align-items:flex-start"><span><b>${esc(d.nom)}</b><br><small style="color:var(--mute)">v${d.version} · ${esc(d.maj_par || '')} · ${new Date(d.maj_le).toLocaleDateString('fr-FR')}${d.verrou ? ' · 🔒 ' + esc(d.verrou.moi ? 'vous' : d.verrou.par) : ''}</small></span>
   ${CL.trash ? (w ? `<button class="tb" data-cl="untrash" data-id="${d.id}" title="Restaurer">Restaurer</button>` : '') : `<button class="tb" data-cl="open" data-id="${d.id}">Ouvrir</button>${w ? `<button data-cl="trash" data-id="${d.id}" title="Mettre à la corbeille" aria-label="Mettre ${esc(d.nom)} à la corbeille">${svg('del')}</button>` : myGroups().length ? `<button class="tb" data-cl="copy" data-id="${d.id}" title="Copier dans mon groupe">Copier</button>` : ''}`}</div>`).join('') : `<p>${CL.trash ? 'La corbeille est vide.' : 'Aucun document.'}</p>`;
  h += `<div class="row">${!CL.trash && w ? '<button class="tb primary" data-cl="saveas">Enregistrer la pièce actuelle ici</button>' : ''}<button class="tb" data-cl="trashview">${CL.trash ? 'Voir les documents' : 'Voir la corbeille'}</button>${CL.trash && e.prof ? '<button class="tb" data-cl="purge">Vider la corbeille</button>' : ''}</div></div>`;
 }
 if (e.prof){
  const G = CL.gp;
  h += `<div class="sec"><h3>Groupes (professeur)</h3>`;
  if (!G) h += '<div class="row"><button class="tb" data-cl="gp">Former ou modifier les groupes</button></div>';
  else {
   h += `<label class="f" for="gpClasse">Classe</label><select id="gpClasse">${(G.classes || []).map(c => `<option${c === G.classe ? ' selected' : ''}>${esc(c)}</option>`).join('')}</select>
    <label class="f" for="gpNom">Nom du groupe</label><input type="text" id="gpNom" value="${esc(G.nom || '')}" placeholder="Groupe 1">
    <p class="note">Cochez les élèves du groupe. Un nom déjà utilisé met ce groupe à jour.</p>
    <div style="max-height:260px;overflow:auto">${(G.eleves || []).map(el => `<label class="chk"><input type="checkbox" data-gpe="${el.id}" ${G.sel && G.sel.includes(el.id) ? 'checked' : ''}> ${esc(el.prenom + ' ' + el.nom)}${el.groupes.length ? ' <small style="color:var(--mute)">(' + el.groupes.map(gid => esc(((CL.esp.groupes.find(x => x.id === gid) || {}).nom) || '?')).join(', ') + ')</small>' : ''}</label>`).join('') || '<p>Aucun élève dans cette classe.</p>'}</div>
    <div class="row"><button class="tb primary" data-cl="gpsave">Enregistrer le groupe</button><button class="tb" data-cl="gpclose">Fermer</button></div>`;
   const gs = CL.esp.groupes.filter(g => g.classe === G.classe);
   if (gs.length) h += '<p class="note">Groupes de la classe : cliquez pour modifier.</p>' + gs.map(g => `<div class="rel"><span><button class="tb" data-cl="gpedit" data-g="${g.id}">${esc(g.nom)}</button> ${g.membres.length} élève(s)</span>${g.documents ? '' : `<button data-cl="gpdel" data-g="${g.id}" title="Supprimer ce groupe vide" aria-label="Supprimer ${esc(g.nom)}">${svg('del')}</button>`}</div>`).join('');
  }
  h += '</div>';
 }
 return h;
}
async function gpLoad(classe){CL.gp.classe = classe; CL.gp.eleves = await rpc('cao_eleves', {p_classe:classe})}
document.addEventListener('change', e => {
 if (e.target.id === 'gpClasse') cloudAct(async () => {CL.gp.nom = ''; CL.gp.sel = []; await gpLoad(e.target.value)});
 if (e.target.dataset && e.target.dataset.gpe && CL.gp){const id = e.target.dataset.gpe; CL.gp.sel = CL.gp.sel || []; if (e.target.checked) CL.gp.sel.push(id); else CL.gp.sel = CL.gp.sel.filter(x => x !== id)}
 if (e.target.id === 'gpNom' && CL.gp) CL.gp.nom = e.target.value;
});
document.addEventListener('click', e => {
 const t = e.target.closest('[data-cl]'); if (!t || !$('#side').contains(t)) return; const a = t.dataset.cl, id = t.dataset.id;
 if (a === 'close'){S.side = null; renderUI(); return}
 if (a === 'gp') return cloudAct(async () => {const classes = await rpc('cao_classes'); CL.gp = {classes, sel:[], nom:''}; if (classes.length) await gpLoad(classes[0])});
 if (a === 'gpclose'){CL.gp = null; renderUI(); return}
 if (a === 'gpedit'){const g = CL.esp.groupes.find(x => x.id === t.dataset.g); CL.gp.nom = g.nom; CL.gp.sel = CL.gp.eleves.filter(el => el.groupes.includes(g.id)).map(el => el.id); renderUI(); return}
 if (a === 'gpdel') return modal('<h3>Supprimer ce groupe ?</h3><p>Le groupe est vide (aucun document).</p>', [{label:'Annuler'}, {label:'Supprimer', primary:true, fn:() => cloudAct(async () => {await rpc('cao_supprimer_groupe', {p_groupe:t.dataset.g}); CL.esp = await rpc('cao_mes_espaces'); await gpLoad(CL.gp.classe)})}]);
 if (a === 'gpsave') return cloudAct(async () => {const nom = (($('#gpNom') || {}).value || '').trim(); if (!nom) throw new Error('Donnez un nom au groupe.'); await rpc('cao_former_groupe', {p_classe:CL.gp.classe, p_nom:nom, p_eleves:CL.gp.sel || []}); CL.esp = await rpc('cao_mes_espaces'); await gpLoad(CL.gp.classe); CL.gp.nom = ''; CL.gp.sel = []; toast('Groupe « ' + nom + ' » enregistré.')});
 if (a === 'retry'){CL.client = null; cloudOpen(); return}
 if (a === 'space') return cloudAct(async () => {CL.space = t.dataset.g || null; CL.trash = false; await cloudList()});
 if (a === 'trashview') return cloudAct(async () => {CL.trash = !CL.trash; await cloudList()});
 if (a === 'open') return cloudAct(() => cloudOpenDoc(id));
 if (a === 'trash') return modal('<h3>Mettre à la corbeille ?</h3><p>Le document pourra être restauré depuis la corbeille du groupe.</p>', [{label:'Annuler'}, {label:'Mettre à la corbeille', primary:true, fn:() => cloudAct(async () => {if (!await rpc('cao_corbeille', {p_doc:id, p_mettre:true})) throw new Error('Impossible : document verrouillé ou hors horaires.'); if (CL.doc && CL.doc.id === id) await cloudClose(true); await cloudList(); CL.esp = await rpc('cao_mes_espaces')})}]);
 if (a === 'untrash') return cloudAct(async () => {await rpc('cao_corbeille', {p_doc:id, p_mettre:false}); await cloudList(); CL.esp = await rpc('cao_mes_espaces')});
 if (a === 'purge') return modal('<h3>Vider la corbeille ?</h3><p>Les documents seront supprimés définitivement.</p>', [{label:'Annuler'}, {label:'Supprimer définitivement', primary:true, fn:() => cloudAct(async () => {const n = await rpc('cao_vider_corbeille', {p_groupe:CL.space}); toast(n + ' document(s) supprimé(s).'); await cloudList()})}]);
 if (a === 'copy' || a === 'copycur'){const gs = myGroups(); if (!gs.length) return; return cloudAct(async () => {const nid = await rpc('cao_copier', {p_doc:a === 'copy' ? id : CL.doc.id, p_groupe:gs[0].id}); CL.space = gs[0].id; CL.trash = false; await cloudList(); CL.esp = await rpc('cao_mes_espaces'); await cloudOpenDoc(nid); toast('Copie créée dans ' + gs[0].nom + '.')})}
 if (a === 'saveas') return cloudAct(() => cloudSaveAs(CL.space));
 if (a === 'save') return cloudAct(cloudSave);
 if (a === 'closedoc') return cloudAct(() => cloudClose());
 if (a === 'versions') return cloudAct(async () => {CL.versions = CL.versions ? null : await rpc('cao_versions_doc', {p_doc:CL.doc.id})});
 if (a === 'restore') return cloudAct(async () => {const r = await rpc('cao_restaurer_version', {p_doc:CL.doc.id, p_numero:+t.dataset.n}); if (!r.ok) throw new Error('Restauration impossible.'); const d = CL.doc.id; await cloudClose(true); await cloudOpenDoc(d); if (CL.space !== undefined) await cloudList(); toast('Version ' + t.dataset.n + ' restaurée (nouvelle version ' + r.version + ').')});
});
addEventListener('beforeunload', e => {if (CL.dirty && CL.doc && CL.doc.edit){e.preventDefault(); e.returnValue = ''}});

// =====================================================================
// Pièce d'exemple : support percé
// =====================================================================
function exampleDoc(){
 const d = newDoc('Support');
 const rect = (W, H, x0 = 0, y0 = 0) => {
  const sk = {pts:{p1:{x:x0, y:y0}, p2:{x:x0+W, y:y0}, p3:{x:x0+W, y:y0+H}, p4:{x:x0, y:y0+H}}, ents:[{id:'e1', t:'line', a:'p1', b:'p2'}, {id:'e2', t:'line', a:'p2', b:'p3'}, {id:'e3', t:'line', a:'p3', b:'p4'}, {id:'e4', t:'line', a:'p4', b:'p1'}],
   cons:[{id:'c1', t:'horiz', e:['e1']}, {id:'c2', t:'horiz', e:['e3']}, {id:'c3', t:'vert', e:['e2']}, {id:'c4', t:'vert', e:['e4']}, {id:'c5', t:'len', e:['e1'], v:W}, {id:'c6', t:'len', e:['e2'], v:H}], nid:10};
  return sk;
 };
 const s1 = Object.assign({id:'fs1', type:'sketch', name:'Esquisse1', plane:{base:'dessus', offset:0}}, rect(80, 50));
 s1.cons.push({id:'c7', t:'coinc', e:['p1', 'O']});
 const b1 = {id:'fb1', type:'extrude', name:'Bossage-Extrusion1', sketch:'fs1', end:'blind', depth:10, flip:false};
 const top = {o:[0, 10, 0], x:[1, 0, 0], n:[0, 1, 0], label:'Face plane'};
 const s2 = {id:'fs2', type:'sketch', name:'Esquisse2', plane:top, pts:{p1:{x:40, y:25}}, ents:[{id:'e1', t:'circle', c:'p1', r:10}], cons:[{id:'c1', t:'diam', e:['e1'], v:20}, {id:'c2', t:'dx', e:['O', 'p1'], v:40, s:1}, {id:'c3', t:'dy', e:['O', 'p1'], v:25, s:1}], nid:10};
 const c1 = {id:'fc1', type:'cut', name:'Enlèvement de matière-Extrusion1', sketch:'fs2', end:'through', depth:10, flip:false};
 const s3 = {id:'fs3', type:'sketch', name:'Esquisse3', plane:top, pts:{p1:{x:10, y:10}, p2:{x:70, y:10}, p3:{x:70, y:40}, p4:{x:10, y:40}},
  ents:[{id:'e1', t:'point', p:'p1'}, {id:'e2', t:'point', p:'p2'}, {id:'e3', t:'point', p:'p3'}, {id:'e4', t:'point', p:'p4'}],
  cons:[{id:'c1', t:'dx', e:['O', 'p1'], v:10, s:1}, {id:'c2', t:'dy', e:['O', 'p1'], v:10, s:1}, {id:'c3', t:'dx', e:['p1', 'p2'], v:60, s:1}, {id:'c4', t:'dy', e:['p2', 'p3'], v:30, s:1}, {id:'c5', t:'horiz', e:['p1', 'p2']}, {id:'c6', t:'vert', e:['p1', 'p4']}, {id:'c7', t:'horiz', e:['p4', 'p3']}], nid:10};
 const h1 = {id:'fh1', type:'hole', name:'Perçage1', sketch:'fs3', d:6.6, end:'through', depth:10, flip:false};
 const f1 = {id:'ff1', type:'fillet', name:'Congé1', r:6, edges:[[0, 5, 0], [80, 5, 0], [80, 5, -50], [0, 5, -50]]};
 const ch = {id:'fch1', type:'chamfer', name:'Chanfrein1', d:1, edges:[{p:[40, 10, -15], g:{t:'circle', r:10, n:[0, 1, 0], rank:'max'}}]};
 d.features = [s1, b1, s2, c1, s3, h1, f1, ch]; d.n = {sketch:3, extrude:1, cut:1, hole:1, fillet:1, chamfer:1}; d.material = 'alu';
 return d;
}

// =====================================================================
// Démarrage
// =====================================================================
window.__cao = {CL, cloudOpen,  S, R, THREE, camera, planeOf, to3, vp, edgeGeo, findEdges, rebuild, solveRaw, analyseDof, profileOf, exampleDoc, openFeature, editSketch, exitSketch, pmOk, renderUI, startSketch, mouse2};
(async () => {
 S.doc = LS.get('cao-modeleur') || newDoc();
 renderUI(); stdView('iso');
 try {
  $('#loadTxt').textContent = 'Chargement du noyau OpenCascade (23 Mo, mis en cache ensuite)…';
  oc = await opencascade({locateFile: f => new URL('lib/occ/' + f, location.href).href}); R.setOC(oc);
  GCS = await init_planegcs_module({locateFile: f => new URL('lib/planegcs/planegcs_dist/' + f, location.href).href});
 } catch (e){$('#loadTxt').textContent = 'Le noyau n’a pas pu démarrer : ' + (e.message || e); return}
 $('#loading').hidden = true;
 rebuild(); stdView('iso'); renderUI();
})();
