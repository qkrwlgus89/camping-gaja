import {CAMP} from './environment';
const r=Math.PI/180;
// J2000 catalogue coordinates -> local east/up/north, with UTC sidereal rotation.
export function celestialDirection(ra:number,dec:number,epoch:number):[number,number,number]{
 const jd=epoch/86400000+2440587.5,t=(jd-2451545)/36525;
 const sidereal=(280.46061837+360.98564736629*(jd-2451545)+.000387933*t*t+CAMP.longitude)*r;
 const h=sidereal-ra*r,d=dec*r,p=CAMP.latitude*r;
 const east=-Math.cos(d)*Math.sin(h),up=Math.sin(d)*Math.sin(p)+Math.cos(d)*Math.cos(h)*Math.cos(p),north=Math.sin(d)*Math.cos(p)-Math.cos(d)*Math.cos(h)*Math.sin(p);
 return [east,up,-north];
}
export function skyAim(ra:number,dec:number,epoch:number):[number,number]{const [x,y,z]=celestialDirection(ra,dec,epoch);return [Math.atan2(-x,-z),Math.asin(y)];}
export const CONSTELLATIONS=[
 {id:'Cas',name:'카시오페이아',latin:'Cassiopeia',ra:15,dec:60,story:'북쪽 하늘에 그려진 다섯 별의 W. 북극성을 찾는 길잡이예요.'},
 {id:'UMa',name:'큰곰자리',latin:'Ursa Major',ra:165,dec:55,story:'북두칠성이 속한 별자리. 국자 끝 두 별을 따라 북쪽을 찾아보세요.'},
 {id:'Ori',name:'오리온자리',latin:'Orion',ra:83,dec:0,story:'나란한 세 별이 허리띠. 붉은 베텔게우스와 푸른 리겔이 마주 봐요.'},
 {id:'Cyg',name:'백조자리',latin:'Cygnus',ra:305,dec:40,story:'은하수 위를 나는 백조. 가장 밝은 데네브가 꼬리 끝에서 빛나요.'},
 {id:'Lyr',name:'거문고자리',latin:'Lyra',ra:282,dec:36,story:'푸른 베가, 우리가 부르는 직녀성. 여름 대삼각형의 한 꼭짓점이에요.'},
 {id:'And',name:'안드로메다',latin:'Andromeda',ra:13,dec:38,story:'가을의 긴 별 사슬. 맑은 밤에는 이웃 은하의 희미한 빛도 느껴보세요.'},
 {id:'Tau',name:'황소자리',latin:'Taurus',ra:65,dec:18,story:'주황빛 알데바란과 작은 별무리 플레이아데스가 어깨를 장식해요.'},
 {id:'Peg',name:'페가수스',latin:'Pegasus',ra:345,dec:22,story:'커다란 사각형으로 찾는 가을의 날개 달린 말.'},
];
