// NOUN PICTURES: a ready drawing for the everyday things a narrator names (a bed, a clock, a door, a cup, a school...).
//
// The narrator says "bed": the viewer should SEE a bed, even with the sound off. The app had about 35 pictures (money, rocket, clock...);
// this adds the common things of daily life, places, weather, food, travel, school, health and feelings, all drawn in the same flat,
// outlined look as the app's own props, around (0,0) and about 200 units across. NOUN_WORDS maps the words (and their plurals and
// close words) to a picture. Pure strings: the player, the exporter and the tests use the same drawings.

const O = (f, s = 7) => `fill="${f}" stroke="#222" stroke-width="${s}" stroke-linejoin="round" stroke-linecap="round"`;
const L = (c = '#222', w = 6) => `fill="none" stroke="${c}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"`;

export const NOUN_ICONS = {
  // ---- home ----
  bed: () => `<rect x="-100" y="-10" width="200" height="44" rx="8" ${O('#8fb4e8')}/><rect x="-100" y="-56" width="20" height="110" rx="4" ${O('#8a5a35')}/><rect x="80" y="-30" width="20" height="84" rx="4" ${O('#8a5a35')}/><rect x="-76" y="-30" width="52" height="24" rx="10" ${O('#ffffff',5)}/><path d="M-20,-12 Q40,-26 96,-10 V0 H-20Z" ${O('#e46b6b',5)}/><rect x="-100" y="30" width="200" height="12" ${O('#6b4423',5)}/>`,
  chair: () => `<rect x="-40" y="-90" width="70" height="70" rx="8" ${O('#c0843d')}/><rect x="-44" y="-22" width="90" height="18" rx="5" ${O('#a86a2c')}/><path d="M-36,-4 V70 M38,-4 V70 M-36,30 H38" ${L('#6b4423',9)}/>`,
  sofa: () => `<rect x="-100" y="-40" width="200" height="50" rx="16" ${O('#6c8ebf')}/><rect x="-110" y="-10" width="30" height="60" rx="10" ${O('#5a7aa8')}/><rect x="80" y="-10" width="30" height="60" rx="10" ${O('#5a7aa8')}/><rect x="-82" y="4" width="164" height="36" rx="8" ${O('#7fa3d6')}/><path d="M-90,50 V62 M90,50 V62" ${L('#222',8)}/>`,
  table: () => `<rect x="-100" y="-26" width="200" height="20" rx="5" ${O('#b07a42')}/><path d="M-80,-6 V60 M80,-6 V60" ${L('#6b4423',12)}/><path d="M-36,-26 V-52 H-8 V-26" ${O('#ffffff',5)}/><circle cx="40" cy="-40" r="14" ${O('#e94f4f',5)}/>`,
  door: () => `<rect x="-55" y="-100" width="110" height="200" rx="6" ${O('#9b6b3d')}/><rect x="-38" y="-80" width="76" height="70" rx="4" ${O('#b88454',5)}/><rect x="-38" y="6" width="76" height="76" rx="4" ${O('#b88454',5)}/><circle cx="36" cy="4" r="8" ${O('#ffd24a',4)}/>`,
  window: () => `<rect x="-80" y="-80" width="160" height="160" rx="6" ${O('#bfe6ff')}/><path d="M0,-80 V80 M-80,0 H80" ${L('#6b4a2f',10)}/><circle cx="-40" cy="-42" r="16" fill="#ffe66b"/><path d="M-88,-88 H88" ${L('#6b4a2f',10)}/>`,
  lamp: () => `<path d="M-50,-30 L-28,-90 H28 L50,-30Z" ${O('#ffd86b')}/><path d="M0,-30 V70" ${L('#555',10)}/><rect x="-40" y="66" width="80" height="16" rx="6" ${O('#555',5)}/><path d="M-70,-10 L-90,10 M70,-10 L90,10 M0,-2 V16" ${L('#ffe66b',6)}/>`,
  candle: () => `<rect x="-22" y="-30" width="44" height="110" rx="6" ${O('#fff3d6')}/><path d="M0,-34 V-48" ${L('#222',5)}/><path d="M0,-96 C22,-70 16,-52 0,-50 C-16,-52 -22,-70 0,-96Z" ${O('#ffb020',4)}/><path d="M0,-80 C8,-66 6,-58 0,-57 C-6,-58 -8,-66 0,-80Z" fill="#fff2a8"/>`,
  mirror: () => `<ellipse rx="60" ry="84" ${O('#c9a86a',9)}/><ellipse rx="46" ry="70" ${O('#d8f0ff',4)}/><path d="M-20,-40 L10,-60 M-26,-14 L22,-46" ${L('#ffffff',6)}/>`,
  key: () => `<circle cx="-50" r="34" ${O('#ffcf3a')}/><circle cx="-50" r="12" fill="#fff" stroke="#222" stroke-width="5"/><path d="M-16,0 H90 M60,0 V24 M80,0 V18" ${L('#222',16)}/><path d="M-16,0 H90 M60,0 V24 M80,0 V18" ${L('#ffcf3a',8)}/>`,
  cup: () => `<path d="M-50,-50 H50 L42,60 Q40,74 26,74 H-26 Q-40,74 -42,60Z" ${O('#ffffff')}/><path d="M50,-26 Q86,-26 82,8 Q78,34 46,30" ${L('#222',8)}/><path d="M-20,-70 Q-10,-86 -20,-100 M8,-70 Q18,-86 8,-100" ${L('#bbb',5)}/><rect x="-36" y="-34" width="72" height="12" fill="#7a4b2a"/>`,
  plate: () => `<ellipse cy="20" rx="100" ry="34" ${O('#ffffff')}/><ellipse cy="14" rx="60" ry="18" ${O('#f3f3f3',4)}/><path d="M-40,10 Q-20,-30 10,-8 Q30,-36 46,6" ${O('#e58a3a',5)}/><circle cx="-8" cy="-6" r="10" fill="#4caf50"/>`,
  phonebook: () => '',
  tv: () => `<rect x="-100" y="-70" width="200" height="130" rx="12" ${O('#333')}/><rect x="-86" y="-58" width="172" height="104" rx="6" ${O('#4fa3ff',4)}/><path d="M-40,60 L-60,90 M40,60 L60,90" ${L('#222',8)}/><path d="M-60,-40 L60,30" ${L('#ffffff55',10)}/>`,
  // ---- personal things ----
  book: () => `<path d="M0,-60 Q-50,-80 -100,-60 V70 Q-50,50 0,70Z" ${O('#ffffff')}/><path d="M0,-60 Q50,-80 100,-60 V70 Q50,50 0,70Z" ${O('#f4f4f4')}/><path d="M-80,-34 Q-50,-44 -20,-34 M-80,-10 Q-50,-20 -20,-10 M20,-34 Q50,-44 80,-34 M20,-10 Q50,-20 80,-10" ${L('#999',4)}/><path d="M-104,-56 V80 Q-50,60 0,80 Q50,60 104,80 V-56" ${L('#3a6ad1',8)}/>`,
  pen: () => `<path d="M-80,70 L-60,30 L50,-80 L80,-50 L-30,60Z" ${O('#3a6ad1')}/><path d="M-80,70 L-60,30 L-30,60Z" ${O('#f5d9a8',5)}/><path d="M38,-68 L68,-38" ${L('#222',6)}/>`,
  letter: () => `<rect x="-90" y="-56" width="180" height="116" rx="8" ${O('#fff7e0')}/><path d="M-90,-56 L0,16 L90,-56" ${L('#222',7)}/><circle cx="56" cy="-24" r="14" fill="#e0455a"/>`,
  gift: () => `<rect x="-70" y="-20" width="140" height="100" ${O('#e0455a')}/><rect x="-82" y="-50" width="164" height="34" ${O('#ff6b7d')}/><path d="M0,-50 V80" ${L('#ffd24a',18)}/><path d="M0,-52 C-30,-96 -70,-70 -36,-52 M0,-52 C30,-96 70,-70 36,-52" ${O('#ffd24a',5)}/>`,
  bag: () => `<path d="M-70,-30 H70 L84,80 H-84Z" ${O('#d98b3a')}/><path d="M-36,-30 V-50 Q0,-96 36,-50 V-30" ${L('#222',8)}/>`,
  suitcase: () => `<rect x="-90" y="-50" width="180" height="120" rx="14" ${O('#a0522d')}/><path d="M-30,-50 V-74 H30 V-50" ${L('#222',9)}/><path d="M-90,0 H90 M-50,-50 V70 M50,-50 V70" ${L('#6b3418',6)}/>`,
  umbrella: () => `<path d="M-100,0 Q0,-120 100,0 Q75,-18 50,0 Q25,-18 0,0 Q-25,-18 -50,0 Q-75,-18 -100,0Z" ${O('#7b2cbf')}/><path d="M0,-2 V70 Q0,90 -20,86" ${L('#222',8)}/>`,
  glasses: () => `<circle cx="-46" r="34" ${O('#bfe6ff66',8)}/><circle cx="46" r="34" ${O('#bfe6ff66',8)}/><path d="M-12,-4 Q0,-14 12,-4 M-80,-6 L-100,-20 M80,-6 L100,-20" ${L('#222',8)}/>`,
  watch: () => `<rect x="-26" y="-100" width="52" height="200" rx="14" ${O('#6b4423')}/><circle r="50" ${O('#d9d9d9')}/><circle r="38" ${O('#ffffff',4)}/><path d="M0,0 V-26 M0,0 L18,8" ${L('#222',6)}/>`,
  ring: () => `<circle cy="20" r="52" ${L('#222',22)}/><circle cy="20" r="52" ${L('#ffcf3a',12)}/><path d="M-24,-36 L0,-70 L24,-36 L0,-20Z" ${O('#bfefff',5)}/>`,
  diamond: () => `<path d="M-80,-20 L-46,-64 H46 L80,-20 L0,76Z" ${O('#9fe7ff')}/><path d="M-80,-20 H80 M-46,-64 L-20,-20 L0,76 L20,-20 L46,-64 M-20,-20 L0,-64 L20,-20" ${L('#222',4)}/>`,
  hat: () => `<ellipse cy="40" rx="100" ry="24" ${O('#333')}/><path d="M-56,40 V-40 Q0,-60 56,-40 V40Z" ${O('#444')}/><rect x="-56" y="8" width="112" height="18" fill="#c0392b"/>`,
  shirt: () => `<path d="M-40,-80 L-100,-40 L-76,0 L-56,-14 V80 H56 V-14 L76,0 L100,-40 L40,-80 Q0,-50 -40,-80Z" ${O('#4f8cff')}/>`,
  dress: () => `<path d="M-30,-90 H30 L36,-30 L90,80 H-90 L-36,-30Z" ${O('#ff6fb5')}/><path d="M-36,-30 H36" ${L('#222',6)}/>`,
  shoe: () => `<path d="M-90,30 V-30 Q-60,-36 -40,-20 Q0,0 60,4 Q96,10 96,40 H-90Z" ${O('#c0392b')}/><path d="M-90,40 H96" ${L('#222',12)}/><path d="M-50,-14 L-30,-4 M-36,-22 L-16,-10" ${L('#ffffff',5)}/>`,
  camera: () => `<rect x="-90" y="-50" width="180" height="110" rx="14" ${O('#444')}/><rect x="-40" y="-72" width="60" height="26" rx="6" ${O('#555',5)}/><circle cy="6" r="38" ${O('#222',5)}/><circle cy="6" r="22" fill="#4fa3ff"/><circle cx="62" cy="-30" r="8" fill="#ffd24a"/>`,
  medicine: () => `<rect x="-90" y="-30" width="180" height="60" rx="30" ${O('#ffffff')}/><path d="M0,-30 V30" ${L('#222',6)}/><path d="M-90,-30 H0 V30 H-60 A30,30 0 0 1 -90,0Z" fill="#e0455a" stroke="#222" stroke-width="6"/>`,
  bottle: () => `<path d="M-20,-100 H20 V-60 Q46,-40 46,-6 V90 H-46 V-6 Q-46,-40 -20,-60Z" ${O('#8fd0ff')}/><rect x="-24" y="-112" width="48" height="18" rx="4" ${O('#3a6ad1',5)}/><rect x="-46" y="10" width="92" height="40" fill="#ffffff" opacity=".8"/>`,
  wallet: () => `<path d="M-100,-50 H-6 V70 H-100 Q-110,70 -110,60 V-40 Q-110,-50 -100,-50Z" ${O('#8a5530')}/><path d="M6,-50 H100 Q110,-50 110,-40 V60 Q110,70 100,70 H6Z" ${O('#9b6238')}/><path d="M-96,-36 H-20 V-6 H-96Z M20,-36 H96 V-6 H20Z" ${O('#6b3e22',4)}/><path d="M-6,-50 Q0,-58 6,-50 V70 Q0,78 -6,70Z" ${O('#5c3a21',4)}/><path d="M-86,14 H-34 M34,14 H86 M-86,36 H-50 M50,36 H86" ${L('#c99a6e',4)}/><path d="M-40,-50 Q-58,-80 -76,-60 M60,-50 Q46,-82 30,-66" ${L('#9aa7b8',4)}/>`,
  // ---- food ----
  food: () => `<ellipse cy="40" rx="100" ry="30" ${O('#ffffff')}/><path d="M-70,30 Q-60,-40 0,-50 Q60,-40 70,30Z" ${O('#e58a3a')}/><path d="M-40,-10 Q-20,-24 0,-10 Q20,-24 40,-10" ${L('#a0522d',6)}/>`,
  bread: () => `<path d="M-90,40 V-20 Q-90,-70 0,-70 Q90,-70 90,-20 V40Z" ${O('#e0a45c')}/><path d="M-40,-40 L-30,-10 M0,-46 L6,-14 M40,-40 L34,-10" ${L('#a0652a',6)}/>`,
  apple: () => `<path d="M0,-40 C-60,-80 -100,-20 -80,30 C-66,70 -30,90 0,72 C30,90 66,70 80,30 C100,-20 60,-80 0,-40Z" ${O('#e33b3b')}/><path d="M0,-42 Q4,-76 20,-90" ${L('#6b4423',7)}/><path d="M10,-70 Q40,-96 60,-70 Q34,-56 10,-70Z" ${O('#4caf50',5)}/>`,
  cake: () => `<rect x="-80" y="-20" width="160" height="90" rx="8" ${O('#f7c6d9')}/><path d="M-80,0 Q-60,20 -40,0 Q-20,20 0,0 Q20,20 40,0 Q60,20 80,0" ${L('#ffffff',10)}/><rect x="-6" y="-70" width="12" height="50" ${O('#ffd24a',4)}/><path d="M0,-92 C12,-80 8,-72 0,-72 C-8,-72 -12,-80 0,-92Z" fill="#ff8a00"/>`,
  pizza: () => `<path d="M0,90 L-90,-70 Q0,-110 90,-70Z" ${O('#ffcf5a')}/><path d="M-90,-70 Q0,-110 90,-70 L80,-54 Q0,-92 -80,-54Z" ${O('#c8813a',5)}/><circle cx="-20" cy="-40" r="14" fill="#d9442b"/><circle cx="24" cy="-20" r="14" fill="#d9442b"/><circle cx="0" cy="20" r="12" fill="#d9442b"/>`,
  burger: () => `<path d="M-90,-10 Q-90,-80 0,-80 Q90,-80 90,-10Z" ${O('#e0a45c')}/><rect x="-96" y="-10" width="192" height="20" rx="8" ${O('#4caf50',5)}/><rect x="-92" y="10" width="184" height="26" rx="10" ${O('#7a3e1e')}/><path d="M-90,36 H90 Q90,70 0,70 Q-90,70 -90,36Z" ${O('#e0a45c')}/>`,
  coffee: () => `<path d="M-50,-40 H50 L40,70 H-40Z" ${O('#ffffff')}/><rect x="-54" y="-58" width="108" height="20" rx="6" ${O('#6b4423',5)}/><rect x="-46" y="0" width="92" height="30" fill="#c0843d"/><path d="M-10,-70 Q0,-90 -10,-110 M14,-70 Q24,-90 14,-110" ${L('#bbb',5)}/>`,
  water: () => `<path d="M0,-90 C40,-30 70,10 70,40 A70,70 0 0 1 -70,40 C-70,10 -40,-30 0,-90Z" ${O('#4fa3ff')}/><path d="M-30,30 Q-30,56 -6,62" ${L('#ffffff',8)}/>`,
  egg: () => `<ellipse cy="10" rx="100" ry="70" ${O('#ffffff')}/><circle cx="-6" cy="4" r="34" ${O('#ffc21a',5)}/>`,
  fish: () => `<path d="M-80,0 Q-20,-60 50,0 Q-20,60 -80,0Z" ${O('#4fa3ff')}/><path d="M50,0 L96,-40 V40Z" ${O('#3a6ad1')}/><circle cx="-46" cy="-8" r="7" fill="#222"/>`,
  // ---- places and buildings ----
  school: () => `<rect x="-100" y="-20" width="200" height="110" ${O('#e8c27a')}/><path d="M-110,-16 L0,-80 L110,-16Z" ${O('#c0392b')}/><rect x="-18" y="40" width="36" height="50" ${O('#6b4a2f',5)}/><rect x="-80" y="10" width="34" height="30" ${O('#bfe6ff',5)}/><rect x="46" y="10" width="34" height="30" ${O('#bfe6ff',5)}/><path d="M0,-80 V-110 H30 V-96 H0" ${O('#e0455a',4)}/><circle cy="-40" r="14" ${O('#fff',4)}/>`,
  hospital: () => `<rect x="-90" y="-80" width="180" height="170" ${O('#f2f2f2')}/><rect x="-30" y="-64" width="60" height="60" rx="6" ${O('#e0455a',5)}/><path d="M0,-56 V-12 M-22,-34 H22" ${L('#fff',10)}/><rect x="-20" y="40" width="40" height="50" ${O('#4fa3ff',5)}/><rect x="-74" y="10" width="34" height="26" ${O('#bfe6ff',4)}/><rect x="40" y="10" width="34" height="26" ${O('#bfe6ff',4)}/>`,
  shop: () => `<rect x="-90" y="-30" width="180" height="120" ${O('#f2e6d0')}/><path d="M-100,-30 L-84,-80 H84 L100,-30Z" ${O('#e0455a')}/><path d="M-60,-80 L-66,-30 M-20,-80 L-22,-30 M20,-80 L22,-30 M60,-80 L66,-30" ${L('#ffffff',8)}/><rect x="-70" y="0" width="70" height="50" ${O('#bfe6ff',5)}/><rect x="20" y="10" width="44" height="80" ${O('#6b4a2f',5)}/>`,
  bank: () => `<path d="M-100,-40 L0,-96 L100,-40Z" ${O('#d9d9d9')}/><rect x="-100" y="70" width="200" height="20" ${O('#bdbdbd')}/><path d="M-76,-30 V64 M-38,-30 V64 M0,-30 V64 M38,-30 V64 M76,-30 V64" ${L('#9e9e9e',16)}/><text y="-50" text-anchor="middle" font-size="34" font-weight="bold" fill="#2e7d32" font-family="Arial">$</text>`,
  church: () => `<rect x="-70" y="-10" width="140" height="100" ${O('#efe3c8')}/><path d="M-80,-6 L0,-70 L80,-6Z" ${O('#8a5a35')}/><path d="M0,-70 V-110 M-14,-96 H14" ${L('#222',8)}/><path d="M-18,90 V40 Q0,22 18,40 V90" ${O('#6b4a2f',5)}/>`,
  village: () => `<path d="M-100,80 V10 L-60,-40 L-20,10 V80Z" ${O('#c89b5c')}/><path d="M-110,14 L-60,-50 L-10,14" ${O('#8a6a2c')}/><path d="M10,80 V20 L54,-26 L98,20 V80Z" ${O('#d7b27a')}/><path d="M0,24 L54,-38 L108,24" ${O('#7a5a24')}/><rect x="-72" y="40" width="24" height="40" ${O('#5c3a21',4)}/><rect x="42" y="44" width="24" height="36" ${O('#5c3a21',4)}/>`,
  tent: () => `<path d="M-100,80 L0,-90 L100,80Z" ${O('#ff9f1c')}/><path d="M0,-90 L-26,80 H26Z" ${O('#c46c00',5)}/><path d="M0,-90 V-110" ${L('#222',6)}/>`,
  farm: () => `<rect x="-80" y="-20" width="160" height="110" ${O('#c0392b')}/><path d="M-96,-16 L0,-90 L96,-16Z" ${O('#8e2a20')}/><path d="M-30,90 V20 H30 V90 M-30,20 L30,90 M30,20 L-30,90" ${L('#ffffff',7)}/>`,
  city: () => `<rect x="-100" y="-30" width="50" height="120" ${O('#6c7a99')}/><rect x="-44" y="-90" width="56" height="180" ${O('#5b6884')}/><rect x="18" y="-50" width="40" height="140" ${O('#7a88a8')}/><rect x="62" y="0" width="40" height="90" ${O('#56627c')}/><path d="M-32,-70 H0 M-32,-40 H0 M-32,-10 H0 M-32,20 H0 M-88,0 H-62 M-88,30 H-62 M28,-26 H48 M28,4 H48" ${L('#ffe66b',6)}/>`,
  road: () => `<path d="M-40,-90 H40 L100,90 H-100Z" ${O('#555')}/><path d="M0,-80 V-50 M0,-20 V20 M0,50 V86" ${L('#ffe66b',10)}/>`,
  bridge: () => `<path d="M-110,20 H110" ${L('#222',16)}/><path d="M-110,20 H110" ${L('#b07a42',10)}/><path d="M-100,20 Q0,-80 100,20" ${L('#8a5a35',10)}/><path d="M-60,20 V-24 M-20,20 V-46 M20,20 V-46 M60,20 V-24" ${L('#8a5a35',6)}/><path d="M-110,60 Q-55,46 0,60 Q55,74 110,60" ${L('#4fa3ff',10)}/>`,
  // ---- nature and weather ----
  tree: () => `<rect x="-14" y="10" width="28" height="80" ${O('#7a4b2a')}/><circle cy="-30" r="56" ${O('#3f9a4a')}/><circle cx="-44" cy="0" r="36" ${O('#4caf50')}/><circle cx="44" cy="0" r="36" ${O('#4caf50')}/>`,
  flower: () => `<path d="M0,10 V90" ${L('#2e7d32',8)}/><path d="M0,60 Q30,40 46,54 Q26,74 0,66" ${O('#4caf50',4)}/>${[0, 72, 144, 216, 288].map((a) => `<ellipse cx="0" cy="-34" rx="20" ry="30" transform="rotate(${a} 0 -20)" ${O('#ff6fb5',4)}/>`).join('')}<circle cy="-20" r="16" ${O('#ffd24a',4)}/>`,
  sun: () => `<circle r="46" ${O('#ffd24a')}/>${[0, 45, 90, 135, 180, 225, 270, 315].map((a) => `<path d="M0,-62 V-92" transform="rotate(${a})" ${L('#ffb020',9)}/>`).join('')}`,
  moon: () => `<path d="M30,-76 A80,80 0 1 0 30,76 A62,62 0 0 1 30,-76Z" ${O('#f4f1d0')}/><circle cx="-30" cy="-10" r="8" fill="#d8d3a8"/><circle cx="-6" cy="34" r="6" fill="#d8d3a8"/>`,
  cloud: () => `<path d="M-80,40 Q-110,40 -110,10 Q-110,-24 -76,-24 Q-70,-66 -24,-62 Q4,-96 44,-70 Q90,-74 90,-30 Q120,-24 116,10 Q112,40 80,40Z" ${O('#ffffff')}/>`,
  rain: () => `<path d="M-80,0 Q-110,0 -110,-28 Q-110,-58 -76,-58 Q-66,-96 -24,-92 Q8,-120 46,-96 Q92,-96 90,-58 Q118,-52 114,-24 Q110,0 80,0Z" ${O('#9aa7b8')}/><path d="M-60,20 L-70,50 M-20,24 L-30,54 M20,20 L10,50 M60,24 L50,54 M-40,64 L-50,90 M40,64 L30,90" ${L('#4fa3ff',7)}/>`,
  snow: () => `${[0, 60, 120].map((a) => `<path d="M0,-80 V80 M-20,-60 L0,-40 L20,-60 M-20,60 L0,40 L20,60" transform="rotate(${a})" ${L('#7fc4ff',9)}/>`).join('')}`,
  mountain: () => `<path d="M-110,80 L-30,-70 L20,10 L50,-30 L110,80Z" ${O('#7d8a9e')}/><path d="M-30,-70 L-52,-30 L-36,-38 L-24,-26 L-12,-40Z" ${O('#ffffff',4)}/>`,
  river: () => `<path d="M-110,-30 Q-50,-70 0,-30 Q50,10 110,-30 V30 Q50,70 0,30 Q-50,-10 -110,30Z" ${O('#4fa3ff')}/><path d="M-80,-10 Q-50,-30 -20,-10 M20,10 Q50,30 80,10" ${L('#ffffff',5)}/>`,
  sea: () => `<rect x="-110" y="-10" width="220" height="90" rx="10" ${O('#2f7fd6')}/><path d="M-110,-10 Q-82,-40 -55,-10 Q-27,-40 0,-10 Q27,-40 55,-10 Q82,-40 110,-10" ${O('#4fa3ff')}/><circle cx="60" cy="-60" r="26" fill="#ffd24a" stroke="#222" stroke-width="5"/>`,
  fire2: () => '',
  wind: () => `<path d="M-100,-30 H40 Q70,-30 70,-56 Q70,-80 46,-80 M-100,10 H80 Q110,10 110,38 Q110,64 84,64 M-80,50 H20" ${L('#7fb8d8',10)}/>`,
  rainbow: () => `${['#e0455a', '#ff9f1c', '#ffd24a', '#4caf50', '#4fa3ff', '#7b2cbf'].map((c, i) => `<path d="M${-100 + i * 12},60 A${100 - i * 12},${100 - i * 12} 0 0 1 ${100 - i * 12},60" fill="none" stroke="${c}" stroke-width="12"/>`).join('')}`,
  // ---- travel ----
  plane: () => `<path d="M-100,0 Q-100,-14 -80,-14 H80 Q110,-14 110,0 Q110,14 80,14 H-80 Q-100,14 -100,0Z" ${O('#e8eef7')}/><path d="M-10,-12 L-50,-80 H-24 L30,-12 M-10,12 L-50,80 H-24 L30,12 M-80,-12 L-96,-46 H-80 L-60,-12" ${O('#4f8cff',5)}/><circle cx="90" cy="-2" r="5" fill="#222"/>`,
  boat: () => `<path d="M-100,10 H100 L70,60 H-70Z" ${O('#a0522d')}/><path d="M0,10 V-90" ${L('#222',8)}/><path d="M6,-86 L76,0 H6Z" ${O('#ffffff',5)}/><path d="M-110,74 Q-80,60 -55,74 Q-27,88 0,74 Q27,60 55,74 Q82,88 110,74" ${L('#4fa3ff',8)}/>`,
  ship: () => `<path d="M-110,10 H110 L80,70 H-80Z" ${O('#c0392b')}/><rect x="-60" y="-40" width="110" height="50" ${O('#ffffff')}/><rect x="-30" y="-80" width="30" height="40" ${O('#333',5)}/><path d="M-44,-20 H-30 M-14,-20 H0 M16,-20 H30" ${L('#4fa3ff',8)}/>`,
  train: () => `<rect x="-100" y="-60" width="170" height="110" rx="14" ${O('#2e7d32')}/><rect x="70" y="-20" width="34" height="70" rx="6" ${O('#1b5e20')}/><rect x="-84" y="-44" width="44" height="34" ${O('#bfe6ff',5)}/><rect x="-28" y="-44" width="44" height="34" ${O('#bfe6ff',5)}/><circle cx="-60" cy="60" r="18" ${O('#222',4)}/><circle cx="30" cy="60" r="18" ${O('#222',4)}/>`,
  bus: () => `<rect x="-110" y="-60" width="220" height="110" rx="16" ${O('#ffcf3a')}/><path d="M-96,-44 H96 V-6 H-96Z" ${O('#bfe6ff',5)}/><path d="M-50,-44 V-6 M0,-44 V-6 M50,-44 V-6" ${L('#222',5)}/><circle cx="-64" cy="52" r="20" ${O('#222',4)}/><circle cx="64" cy="52" r="20" ${O('#222',4)}/>`,
  bicycle: () => `<circle cx="-60" cy="30" r="40" ${L('#222',8)}/><circle cx="60" cy="30" r="40" ${L('#222',8)}/><path d="M-60,30 L-20,-30 H40 L60,30 M-20,-30 L0,30 L40,-30 M-26,-44 H-6 M40,-30 L34,-54 H54" ${L('#e0455a',8)}/>`,
  map: () => `<path d="M-100,-60 L-34,-80 L34,-60 L100,-80 V70 L34,90 L-34,70 L-100,90Z" ${O('#f4e7c5')}/><path d="M-34,-80 V70 M34,-60 V90" ${L('#c9b48a',5)}/><path d="M-70,30 Q-40,-20 0,10 Q30,30 60,-30" ${L('#e0455a',6)}/><path d="M52,-44 L68,-28 M68,-44 L52,-28" ${L('#e0455a',6)}/>`,
  ticket: () => `<path d="M-100,-50 H100 V-16 A16,16 0 0 0 100,16 V50 H-100 V16 A16,16 0 0 0 -100,-16Z" ${O('#ffcf3a')}/><path d="M40,-50 V50" ${L('#222',4)}/><text x="-26" y="12" text-anchor="middle" font-size="26" font-weight="bold" fill="#222" font-family="Arial">TICKET</text>`,
  // ---- school, work, tech ----
  backpack: () => `<rect x="-60" y="-70" width="120" height="160" rx="30" ${O('#3a6ad1')}/><rect x="-40" y="10" width="80" height="56" rx="12" ${O('#2c55b0',5)}/><path d="M-30,-70 Q0,-110 30,-70" ${L('#222',8)}/>`,
  graduation: () => `<path d="M-110,-20 L0,-70 L110,-20 L0,30Z" ${O('#333')}/><path d="M-60,4 V50 Q0,80 60,50 V4" ${O('#444')}/><path d="M90,-12 V50" ${L('#ffd24a',6)}/><circle cx="90" cy="56" r="9" fill="#ffd24a"/>`,
  board: () => `<rect x="-100" y="-70" width="200" height="130" rx="6" ${O('#2e5d3a',9)}/><path d="M-70,-30 H10 M-70,0 H40 M-70,30 H-10" ${L('#ffffff',6)}/><path d="M-60,60 L-80,100 M60,60 L80,100" ${L('#8a5a35',8)}/>`,
  pencil: () => `<path d="M-90,60 L-70,80 L80,-70 L60,-90Z" ${O('#ffcf3a')}/><path d="M-90,60 L-100,100 L-70,80Z" ${O('#f5d9a8',5)}/><path d="M60,-90 L80,-70 L96,-86 L76,-106Z" ${O('#ff8fa3',5)}/>`,
  money: () => '',
  briefcase: () => `<rect x="-100" y="-40" width="200" height="120" rx="14" ${O('#5c3a21')}/><path d="M-30,-40 V-70 H30 V-40" ${L('#222',9)}/><path d="M-100,10 H100" ${L('#3e2615',6)}/><rect x="-14" y="0" width="28" height="22" ${O('#ffd24a',4)}/>`,
  desk: () => `<rect x="-110" y="-10" width="220" height="20" ${O('#b07a42')}/><rect x="40" y="10" width="60" height="80" ${O('#a06a35')}/><path d="M-96,10 V90" ${L('#6b4423',12)}/><rect x="-60" y="-70" width="80" height="56" rx="4" ${O('#333',5)}/><rect x="-52" y="-62" width="64" height="40" fill="#4fa3ff"/>`,
  mail: () => `<rect x="-90" y="-56" width="180" height="116" rx="8" ${O('#ffffff')}/><path d="M-90,-56 L0,16 L90,-56" ${L('#222',7)}/>`,
  chat: () => `<path d="M-90,-70 H90 Q110,-70 110,-50 V20 Q110,40 90,40 H-20 L-60,80 V40 H-90 Q-110,40 -110,20 V-50 Q-110,-70 -90,-70Z" ${O('#ffffff')}/><circle cx="-40" cy="-14" r="10" fill="#222"/><circle cy="-14" r="10" fill="#222"/><circle cx="40" cy="-14" r="10" fill="#222"/>`,
  music: () => `<path d="M-40,60 V-60 L80,-90 V30" ${L('#222',10)}/><ellipse cx="-60" cy="62" rx="28" ry="20" ${O('#7b2cbf',6)}/><ellipse cx="60" cy="32" rx="28" ry="20" ${O('#7b2cbf',6)}/><path d="M-40,-30 L80,-60" ${L('#222',10)}/>`,
  guitar: () => `<path d="M-30,10 C-90,0 -100,80 -40,90 C0,96 30,60 20,30 C40,10 30,-10 10,-10 C0,-20 -20,-10 -30,10Z" ${O('#d98b3a')}/><circle cx="-30" cy="50" r="14" fill="#5c3a21"/><path d="M0,30 L90,-80" ${L('#5c3a21',12)}/><rect x="80" y="-104" width="24" height="34" rx="4" transform="rotate(40 92 -87)" ${O('#5c3a21',4)}/>`,
  microphone: () => `<rect x="-30" y="-100" width="60" height="100" rx="30" ${O('#555')}/><path d="M-50,-30 Q-50,40 0,40 Q50,40 50,-30 M0,40 V80 M-36,84 H36" ${L('#222',8)}/>`,
  headphones: () => `<path d="M-70,20 V-10 Q-70,-80 0,-80 Q70,-80 70,-10 V20" ${L('#222',12)}/><rect x="-96" y="0" width="40" height="70" rx="14" ${O('#e0455a')}/><rect x="56" y="0" width="40" height="70" rx="14" ${O('#e0455a')}/>`,
  ball: () => `<circle r="70" ${O('#ffffff')}/><path d="M0,-24 L22,-8 L14,18 H-14 L-22,-8Z" fill="#222"/><path d="M0,-24 V-70 M22,-8 L64,-24 M14,18 L40,56 M-14,18 L-40,56 M-22,-8 L-64,-24" ${L('#222',5)}/>`,
  medal: () => `<path d="M-40,-100 L-10,-20 M40,-100 L10,-20" ${L('#e0455a',16)}/><circle cy="30" r="50" ${O('#ffcf3a')}/><path d="M0,6 L8,24 L28,26 L12,38 L18,58 L0,46 L-18,58 L-12,38 L-28,26 L-8,24Z" fill="#e0a800"/>`,
  battery: () => `<rect x="-90" y="-40" width="170" height="80" rx="10" ${O('#ffffff')}/><rect x="80" y="-18" width="16" height="36" rx="4" ${O('#222',4)}/><rect x="-78" y="-28" width="60" height="56" fill="#e0455a"/>`,
  // ---- health and body ----
  brain: () => `<path d="M-10,-80 Q-70,-90 -80,-30 Q-110,0 -80,40 Q-70,80 -20,70 Q-6,90 10,70 Q60,90 80,40 Q110,0 80,-30 Q70,-90 10,-80Z" ${O('#ff9fb3')}/><path d="M0,-78 V70 M-60,-30 Q-30,-20 -40,10 M60,-30 Q30,-20 40,10 M-50,40 Q-24,30 -20,50 M50,40 Q24,30 20,50" ${L('#c7607a',5)}/>`,
  eye: () => `<path d="M-100,0 Q0,-80 100,0 Q0,80 -100,0Z" ${O('#ffffff')}/><circle r="34" ${O('#3a7bd5',5)}/><circle r="16" fill="#111"/><circle cx="-10" cy="-10" r="6" fill="#fff"/>`,
  hand: () => `<path d="M-40,90 V0 L-60,-30 Q-70,-50 -50,-56 L-30,-26 V-90 Q-30,-104 -16,-104 Q-2,-104 -2,-90 V-40 V-100 Q-2,-114 12,-114 Q26,-114 26,-100 V-40 V-90 Q26,-104 40,-104 Q54,-104 54,-90 V-30 V-70 Q54,-84 66,-84 Q80,-84 80,-70 V30 Q80,90 20,90Z" ${O('#f2c28f')}/>`,
  baby: () => `<ellipse cy="40" rx="60" ry="50" ${O('#ffd1e1')}/><circle cy="-36" r="48" ${O('#f6d2b4')}/><circle cx="-16" cy="-40" r="5" fill="#222"/><circle cx="16" cy="-40" r="5" fill="#222"/><path d="M-12,-18 Q0,-8 12,-18" ${L('#222',4)}/><path d="M0,-84 Q16,-96 10,-76" ${L('#5c3a21',5)}/>`,
  tooth: () => `<path d="M-60,-70 Q-30,-90 0,-74 Q30,-90 60,-70 Q90,-40 60,10 L40,80 Q30,96 18,76 L0,30 L-18,76 Q-30,96 -40,80 L-60,10 Q-90,-40 -60,-70Z" ${O('#ffffff')}/>`,
  // ---- signs and ideas ----
  warning: () => `<path d="M0,-90 L100,80 H-100Z" ${O('#ffcf3a')}/><path d="M0,-30 V24" ${L('#222',14)}/><circle cy="50" r="9" fill="#222"/>`,
  calendar: () => `<rect x="-90" y="-70" width="180" height="160" rx="12" ${O('#ffffff')}/><rect x="-90" y="-70" width="180" height="44" rx="12" ${O('#e0455a')}/><path d="M-50,-90 V-56 M50,-90 V-56" ${L('#222',10)}/>${[0, 1, 2].map((r) => [0, 1, 2, 3].map((c) => `<rect x="${-66 + c * 36}" y="${-12 + r * 32}" width="22" height="20" rx="3" fill="#cfd8e3"/>`).join('')).join('')}`,
  hourglass: () => `<path d="M-60,-90 H60 M-60,90 H60" ${L('#8a5a35',14)}/><path d="M-46,-84 H46 Q46,-30 0,0 Q46,30 46,84 H-46 Q-46,30 0,0 Q-46,-30 -46,-84Z" ${O('#e6f4ff',6)}/><path d="M-30,-60 H30 Q20,-30 0,-10 Q-20,-30 -30,-60Z M-30,80 Q0,40 30,80Z" fill="#e0b84f"/>`,
  bell: () => `<path d="M-70,50 Q-56,30 -56,-10 Q-56,-70 0,-76 Q56,-70 56,-10 Q56,30 70,50Z" ${O('#ffcf3a')}/><circle cy="66" r="16" ${O('#e0a800',5)}/><path d="M-84,-60 Q-100,-30 -90,0 M84,-60 Q100,-30 90,0" ${L('#ffcf3a',7)}/>`,
  idea: () => '',
  peace: () => `<circle r="80" ${O('#ffffff',9)}/><path d="M0,-80 V80 M0,10 L-56,58 M0,10 L56,58" ${L('#222',10)}/>`,
  police: () => `<path d="M0,-96 L76,-66 V0 Q76,64 0,96 Q-76,64 -76,0 V-66Z" ${O('#2c55b0')}/><path d="M0,-50 L12,-16 H48 L20,6 L30,40 L0,20 L-30,40 L-20,6 L-48,-16 H-12Z" fill="#ffcf3a" stroke="#222" stroke-width="4"/>`,
  siren: () => `<rect x="-70" y="40" width="140" height="30" rx="6" ${O('#333')}/><path d="M-50,40 V-10 Q-50,-60 0,-60 Q50,-60 50,-10 V40Z" ${O('#e0455a')}/><path d="M-90,-60 L-110,-80 M90,-60 L110,-80 M0,-76 V-100" ${L('#e0455a',8)}/>`,
  chain: () => `<rect x="-100" y="-26" width="80" height="52" rx="26" ${L('#222',14)}/><rect x="-40" y="-26" width="80" height="52" rx="26" ${L('#222',14)}/><rect x="20" y="-26" width="80" height="52" rx="26" ${L('#222',14)}/><rect x="-100" y="-26" width="80" height="52" rx="26" ${L('#9aa0ab',8)}/><rect x="-40" y="-26" width="80" height="52" rx="26" ${L('#b9bec6',8)}/><rect x="20" y="-26" width="80" height="52" rx="26" ${L('#9aa0ab',8)}/>`,
  tools: () => `<path d="M-70,70 L30,-30" ${L('#6b4423',16)}/><path d="M10,-60 L60,-10 L80,-30 L30,-80Z" ${O('#9aa0ab')}/><path d="M70,70 L-20,-20" ${L('#9aa0ab',14)}/><circle cx="-34" cy="-34" r="26" ${L('#9aa0ab',14)}/>`,
  magnifier: () => `<circle cx="-20" cy="-20" r="56" ${O('#d8f0ff66',12)}/><path d="M20,20 L90,90" ${L('#222',22)}/><path d="M20,20 L90,90" ${L('#8a5a35',12)}/>`,
  question2: () => '',
  zzz: () => `<text x="-60" y="40" font-size="80" font-weight="900" fill="#7fb8ff" stroke="#222" stroke-width="4" font-family="Arial">Z</text><text x="0" y="-10" font-size="60" font-weight="900" fill="#7fb8ff" stroke="#222" stroke-width="4" font-family="Arial">Z</text><text x="44" y="-50" font-size="42" font-weight="900" fill="#7fb8ff" stroke="#222" stroke-width="3" font-family="Arial">Z</text>`,
  tear: () => `<path d="M0,-90 C40,-30 66,6 66,40 A66,66 0 0 1 -66,40 C-66,6 -40,-30 0,-90Z" ${O('#7fc4ff')}/><path d="M-26,30 Q-26,54 -4,60" ${L('#ffffff',7)}/>`,
  broken: () => `<path d="M-6,50 C-90,-10 -40,-70 -6,-24 L-20,0 L4,14 L-10,40Z" ${O('#e0455a')}/><path d="M10,50 C90,-10 40,-70 10,-24 L24,-6 L2,12 L16,38Z" ${O('#c0392b')}/>`,
  ladder: () => `<path d="M-40,-100 V100 M40,-100 V100" ${L('#8a5a35',12)}/><path d="M-40,-70 H40 M-40,-30 H40 M-40,10 H40 M-40,50 H40 M-40,90 H40" ${L('#a0652a',9)}/>`,
};
// drop the placeholders
for (const k of Object.keys(NOUN_ICONS)) { if (!NOUN_ICONS[k]()) delete NOUN_ICONS[k]; }

// [words, picture]. The first match of each line counts. Plurals and close words are part of the pattern.
export const NOUN_WORDS = [
  [/\b(wallets?|purse|empty pockets?|cost (?:him|her|them|me) everything|spent (?:all|everything|every)|savings|broke)\b/i, 'wallet'],
  [/\b(beds?|bedroom|slept|sleeping|asleep|bedtime|mattress|pillow)\b/i, 'bed'],
  [/\b(chairs?|stool|seat)\b/i, 'chair'], [/\b(sofa|couch)\b/i, 'sofa'],
  [/\b(tables?|dinner table|dining)\b/i, 'table'], [/\b(doors?|doorway|knocked|front door|gate)\b/i, 'door'],
  [/\b(windows?)\b/i, 'window'], [/\b(lamps?|lantern)\b/i, 'lamp'], [/\b(candles?|candlelight)\b/i, 'candle'],
  [/\b(mirrors?|reflection)\b/i, 'mirror'], [/\b(keys?|unlocked)\b/i, 'key'],
  [/\b(cups?|mug|tea)\b/i, 'cup'], [/\b(coffee|espresso)\b/i, 'coffee'], [/\b(plates?|meal|dinner|lunch|breakfast)\b/i, 'plate'],
  [/\b(tv|television|movie night|watched the news)\b/i, 'tv'],
  [/\b(books?|novel|read(?:ing)? a|library|bible|story ?book)\b/i, 'book'], [/\b(pens?|signed|signature)\b/i, 'pen'],
  [/\b(letters?|envelope)\b/i, 'letter'], [/\b(emails?|inbox|mail)\b/i, 'mail'], [/\b(gifts?|presents?|birthday present)\b/i, 'gift'],
  [/\b(suitcases?|luggage|packed (?:his|her|their) bags)\b/i, 'suitcase'], [/\b(umbrellas?)\b/i, 'umbrella'],
  [/\b(glasses|spectacles)\b/i, 'glasses'], [/\b(watch|wristwatch)\b/i, 'watch'], [/\b(rings?|engaged|engagement|wedding)\b/i, 'ring'],
  [/\b(diamonds?|jewel(?:s|ry)?|gems?)\b/i, 'diamond'], [/\b(hats?|cap)\b/i, 'hat'], [/\b(shirts?|clothes|t-shirt)\b/i, 'shirt'],
  [/\b(dress(?:es)?|gown)\b/i, 'dress'], [/\b(shoes?|sneakers|boots)\b/i, 'shoe'], [/\b(cameras?|photos?|photograph(?:s|ed)?|picture)\b/i, 'camera'],
  [/\b(medicine|pills?|tablets?|drugs?|medication)\b/i, 'medicine'], [/\b(bottles?)\b/i, 'bottle'],
  [/\b(food|ate|eating|cook(?:ed|ing)?|hungry|starv(?:ed|ing))\b/i, 'food'], [/\b(bread|loaf|bakery)\b/i, 'bread'],
  [/\b(apples?|fruits?)\b/i, 'apple'], [/\b(cakes?|birthday)\b/i, 'cake'], [/\b(pizza)\b/i, 'pizza'], [/\b(burgers?|fast food)\b/i, 'burger'],
  [/\b(water|thirsty|well water)\b/i, 'water'], [/\b(eggs?)\b/i, 'egg'], [/\b(fish(?:ing)?|fisherman)\b/i, 'fish'],
  [/\b(schools?|class(?:room)?|teacher|students?|pupils?|lessons?)\b/i, 'school'], [/\b(hospitals?|clinic|doctor|nurse|surgery)\b/i, 'hospital'],
  [/\b(shops?|stores?|market|mall|shopping)\b/i, 'shop'], [/\b(banks?|loan)\b/i, 'bank'], [/\b(church|chapel|mosque|temple|prayed|prayer)\b/i, 'church'],
  [/\b(village|hut|huts|rural)\b/i, 'village'], [/\b(tents?|camping|camp)\b/i, 'tent'], [/\b(farms?|farmer|barn|harvest|crops?)\b/i, 'farm'],
  [/\b(city|town|downtown|streets?)\b/i, 'city'], [/\b(roads?|highway|journey|path)\b/i, 'road'], [/\b(bridges?)\b/i, 'bridge'],
  [/\b(trees?|forest|woods|jungle)\b/i, 'tree'], [/\b(flowers?|roses?|garden|bloom(?:ed)?)\b/i, 'flower'],
  [/\b(sun|sunny|sunrise|sunset|morning|dawn|summer)\b/i, 'sun'], [/\b(moon|nights?|midnight|evening|stars at night)\b/i, 'moon'],
  [/\b(clouds?|cloudy|sky)\b/i, 'cloud'], [/\b(rain(?:ed|ing|y)?|rainstorm|drizzle)\b/i, 'rain'], [/\b(snow(?:ed|ing|y)?|winter|cold|freez(?:ing|e))\b/i, 'snow'],
  [/\b(mountains?|hills?|climb(?:ed)? the)\b/i, 'mountain'], [/\b(rivers?|stream|lake)\b/i, 'river'], [/\b(sea|ocean|beach|waves?|shore)\b/i, 'sea'],
  [/\b(wind|windy|breeze)\b/i, 'wind'], [/\b(rainbow|hope)\b/i, 'rainbow'],
  [/\b(planes?|airplane|flight|flew|airport|fly to)\b/i, 'plane'], [/\b(boats?|canoe|sailed|rowing)\b/i, 'boat'], [/\b(ships?|cruise|sailors?)\b/i, 'ship'],
  [/\b(trains?|railway|station)\b/i, 'train'], [/\b(bus(?:es)?)\b/i, 'bus'], [/\b(bikes?|bicycles?|cycling)\b/i, 'bicycle'],
  [/\b(maps?|directions|lost his way|lost her way|travel(?:ed|led|ing)?|trip)\b/i, 'map'], [/\b(tickets?|concert)\b/i, 'ticket'],
  [/\b(backpack|schoolbag|school bag)\b/i, 'backpack'], [/\b(graduat(?:ed|ion|e)|degree|diploma|university|college)\b/i, 'graduation'],
  [/\b(blackboard|whiteboard|chalkboard|exam|test|homework)\b/i, 'board'], [/\b(pencils?|wrote|writing|drew|drawing|sketch(?:ed)?)\b/i, 'pencil'],
  [/\b(job|jobs|work(?:ed|ing)?|office|interview|boss|career|business)\b/i, 'briefcase'], [/\b(desk)\b/i, 'desk'],
  [/\b(chat(?:ted)?|messages?|texted|talked|conversation)\b/i, 'chat'], [/\b(music|songs?|sang|sing(?:ing)?|melody)\b/i, 'music'],
  [/\b(guitar|band)\b/i, 'guitar'], [/\b(microphone|speech|podcast|stage)\b/i, 'microphone'], [/\b(headphones|listen(?:ed|ing)? to music)\b/i, 'headphones'],
  [/\b(football|soccer|ball|basketball|game day|match)\b/i, 'ball'], [/\b(medals?|gold medal|olympics?|award)\b/i, 'medal'],
  [/\b(battery|charge|charging|energy|tired|exhausted)\b/i, 'battery'],
  [/\b(brain|think(?:ing)?|thought|smart|genius|remember(?:ed)?|memory)\b/i, 'brain'], [/\b(eyes?|stared|staring|gaze[ds]?|glanced)\b/i, 'eye'],
  [/\b(hands?|handshake|waved)\b/i, 'hand'], [/\b(baby|babies|newborn|born|pregnan(?:t|cy))\b/i, 'baby'], [/\b(tooth|teeth|dentist)\b/i, 'tooth'],
  [/\b(danger(?:ous)?|warning|careful|risk(?:y)?|threat)\b/i, 'warning'], [/\b(calendar|days? later|weeks?|months?|years? later|date)\b/i, 'calendar'],
  [/\b(waited|waiting|patience|hours|time passed|time went by)\b/i, 'hourglass'], [/\b(bell|alarm|rang)\b/i, 'bell'],
  [/\b(peace|calm|quiet)\b/i, 'peace'], [/\b(police|officer|arrest(?:ed)?|cops?)\b/i, 'police'], [/\b(emergency|ambulance|siren)\b/i, 'siren'],
  [/\b(prison|jail|chains?|trapped|slave(?:ry)?)\b/i, 'chain'], [/\b(tools?|repair(?:ed)?|fix(?:ed)?|built|build(?:ing)?|mechanic)\b/i, 'tools'],
  [/\b(search(?:ed|ing)?|investigat(?:e|ed|ion)|clues?|detective|found out|discover(?:ed)?)\b/i, 'magnifier'],
  [/\b(nap|snor(?:e|ed|ing)|dream(?:ed|s)?|fell asleep)\b/i, 'zzz'], [/\b(cr(?:y|ied|ying)|tears?|wept|sad(?:ness)?|grie(?:f|ved))\b/i, 'tear'],
  [/\b(heartbr(?:oken|eak)|broke (?:his|her|my) heart|breakup|divorce)\b/i, 'broken'], [/\b(ladder|climb(?:ed|ing)? up|step by step|promotion)\b/i, 'ladder'],
];

/** Ideas and moods (a brain for "thinking", a road for "journey"): shown only when no real object was named in the same moment. */
export const WEAK = new Set(['brain', 'eye', 'hand', 'chat', 'briefcase', 'battery', 'calendar', 'hourglass', 'peace', 'warning', 'tools', 'magnifier', 'map', 'road', 'sun', 'moon', 'snow', 'cloud', 'rainbow', 'ladder', 'music', 'food', 'tear', 'zzz', 'pencil']);

/** What daily-life things the words name, and where in the text they are said: [{share, name, word}] (share 0..1 = position in the text). */
export function nounsIn(text) {
  const s = String(text || '').replace(/\s+/g, ' ').trim();
  if (!s) return [];
  const out = [];
  for (const [re, name] of NOUN_WORDS) {
    if (!NOUN_ICONS[name]) continue;
    const m = re.exec(s);
    if (!m) continue;
    out.push({ share: (m.index + m[0].length / 2) / s.length, name, word: m[0].toLowerCase(), weak: WEAK.has(name) });
  }
  return out.sort((a, b) => a.share - b.share);
}

/** Things a person holds up in their hands (shown IN the hands of the main person, not floating in a corner). */
export const HOLDABLE = new Set(['wallet', 'cup', 'coffee', 'phone', 'key', 'book', 'letter', 'mail', 'gift', 'bottle', 'apple', 'camera', 'pen', 'pencil', 'ticket', 'medal',
  'ring', 'map', 'bread', 'pizza', 'burger', 'stack', 'coin', 'newspaper', 'folder', 'trophy', 'diamond', 'egg', 'fish', 'medicine', 'flower', 'bag', 'cake', 'plate', 'food', 'water', 'guitar', 'microphone', 'ball', 'tools', 'magnifier', 'watch', 'glasses', 'hat', 'shoe', 'shirt', 'umbrella', 'backpack', 'briefcase', 'calendar', 'hourglass', 'chain', 'candle', 'lamp']);

export const NOUN_NAMES = Object.keys(NOUN_ICONS);
