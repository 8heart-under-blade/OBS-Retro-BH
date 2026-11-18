/* JPL approximate J2000 elements, frozen ellipse POC (not a live ephemeris).
 * https://ssd.jpl.nasa.gov/planets/approx_pos.html */
(function(root){
'use strict';
const rad=Math.PI/180,TAU=2*Math.PI;
// name, semi-major axis AU, e, inclination, mean longitude, perihelion, node, period days
const rows=[
['mercury',.38709927,.20563593,7.00497902,252.2503235,77.45779628,48.33076593,87.969],
['venus',.72333566,.00677672,3.39467605,181.9790995,131.60246718,76.67984255,224.701],
['earth',1.00000261,.01671123,-.00001531,100.46457166,102.93768193,0,365.256],
['mars',1.52371034,.09339410,1.84969142,-4.55343205,-23.94362959,49.55953891,686.98],
['jupiter',5.202887,.04838624,1.30439695,34.39644051,14.72847983,100.47390909,4332.589],
['saturn',9.53667594,.05386179,2.48599187,49.95424423,92.59887831,113.66242448,10759.22],
['uranus',19.18916464,.04725744,.77263783,313.23810451,170.9542763,74.01692503,30685.4],
['neptune',30.06992276,.00859048,1.77004347,-55.12002969,44.96476227,131.78422574,60189]
];
const planets=rows.map(([name,a,e,i,L,peri,node,period])=>({name,a,e,i:i*rad,L:L*rad,peri:peri*rad,node:node*rad,period}));
function eccentricAnomaly(M,e){M=((M+Math.PI)%TAU+TAU)%TAU-Math.PI;let E=M;for(let j=0;j<12;j++){const d=(E-e*Math.sin(E)-M)/(1-e*Math.cos(E));E-=d;if(Math.abs(d)<1e-12)break;}return E;}
function position(p,days=0,E){
if(E===undefined)E=eccentricAnomaly(p.L-p.peri+TAU*days/p.period,p.e);
const x=p.a*(Math.cos(E)-p.e),y=p.a*Math.sqrt(1-p.e*p.e)*Math.sin(E),w=p.peri-p.node;
const cw=Math.cos(w),sw=Math.sin(w),cn=Math.cos(p.node),sn=Math.sin(p.node),ci=Math.cos(p.i),si=Math.sin(p.i);
return {x:(cw*cn-sw*sn*ci)*x+(-sw*cn-cw*sn*ci)*y,y:(cw*sn+sw*cn*ci)*x+(-sw*sn+cw*cn*ci)*y,z:sw*si*x+cw*si*y};
}
// Camera: view above ecliptic, then modest roll; z is toward the viewer.
function project(p,a=.36){const roll=-.14;const x=p.x,y=-p.y*Math.sin(a)-p.z*Math.cos(a);return{x:x*Math.cos(roll)-y*Math.sin(roll),y:x*Math.sin(roll)+y*Math.cos(roll),z:-p.y*Math.cos(a)+p.z*Math.sin(a)};}
function sunDirection(p){const len=Math.hypot(p.x,p.y,p.z);return{x:-p.x/len,y:-p.y/len,z:-p.z/len};}
const api={planets,eccentricAnomaly,position,project,sunDirection};root.CelestialOrbits=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
