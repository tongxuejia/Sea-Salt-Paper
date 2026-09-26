/* cards.js — 牌定义、颜色表、洗牌建堆（无 DOM 依赖，可在浏览器与 node 中运行） */
(function (global) {
  'use strict';

  // 牌类型定义：count 为牌库中的张数，kind 为类别
  const CARD_TYPES = {
    crab:       { name: '螃蟹',       count: 9, kind: 'duo' },
    boat:       { name: '小船',       count: 8, kind: 'duo' },
    fish:       { name: '鱼',         count: 7, kind: 'duo' },
    shark:      { name: '鲨鱼',       count: 5, kind: 'duo' },
    swimmer:    { name: '游泳者',     count: 5, kind: 'duo' },
    mermaid:    { name: '美人鱼',     count: 4, kind: 'special' },
    shell:      { name: '贝壳',       count: 6, kind: 'collector' },
    octopus:    { name: '章鱼',       count: 5, kind: 'collector' },
    penguin:    { name: '企鹅',       count: 3, kind: 'collector' },
    sailor:     { name: '水手',       count: 2, kind: 'collector' },
    lighthouse: { name: '灯塔',       count: 1, kind: 'multiplier' },
    shoal:      { name: '鱼群',       count: 1, kind: 'multiplier' },
    colony:     { name: '企鹅栖息地', count: 1, kind: 'multiplier' },
    captain:    { name: '船长',       count: 1, kind: 'multiplier' },
    /* —— 一扩 Extra Salt：8 张牌 / 5 种效果（exp:true 供 UI 打标与牌表分组）——
       来源：Bombyx 官方《EXTRA SALT》规则 + Pandasaurus 发行说明。
       牌数分配官方口径：1 螃蟹篮 + 2 水母 + 1 龙虾 + 3 海星 + 1 海马 = 8 张。 */
    jellyfish:  { name: '水母',     count: 2, kind: 'duo',      exp: true, pairWith: 'swimmer' },
    lobster:    { name: '龙虾',     count: 1, kind: 'duo',      exp: true, pairWith: 'crab' },
    starfish:   { name: '海星',     count: 3, kind: 'special',  exp: true },
    seahorse:   { name: '海马',     count: 1, kind: 'special',  exp: true },
    basket:     { name: '螃蟹篮',   count: 1, kind: 'multiplier', exp: true },
  };
  
  // 一扩牌的入组顺序（决定 id 段与牌表分组）
  const EXP_ORDER = ['jellyfish', 'lobster', 'starfish', 'seahorse', 'basket'];

  // 收藏牌得分表：按持有张数（下标 = 张数-1）计分
  const COLLECTOR_SCORES = {
    shell:   [0, 2, 4, 6, 8, 10],   // 1-6 张
    octopus: [0, 3, 6, 9, 12],      // 1-5 张
    penguin: [1, 3, 5],             // 1-3 张
    sailor:  [0, 5],                // 1-2 张
  };

  // 倍增牌：每张目标牌加的分值
  const MULTIPLIER_VALUES = {
    lighthouse: { per: 1, target: 'boat',    name: '灯塔' },
    shoal:      { per: 1, target: 'fish',    name: '鱼群' },
    colony:     { per: 2, target: 'penguin', name: '企鹅栖息地' },
    captain:    { per: 3, target: 'sailor',  name: '船长' },
    // 一扩：螃蟹篮 = 每张螃蟹 1 分（本牌自身不是螃蟹，故不会被自己加成）
    basket:     { per: 1, target: 'crab',    name: '螃蟹篮' },
  };

  // 11 种颜色（名称与色值对齐官方牌表：Dark Blue / Teal / Black / Yellow / Green /
  // Purple / Grey / White / Orange / Pink / Tan）
  const COLORS = {
    darkblue: { name: '深蓝', hex: '#1e3f73' },
    teal:     { name: '青绿', hex: '#1f8a93' },
    black:    { name: '黑',   hex: '#26292e' },
    yellow:   { name: '黄',   hex: '#e9c449' },
    green:    { name: '绿',   hex: '#3f7d4e' },
    white:    { name: '白',   hex: '#f2efe6' },
    purple:   { name: '紫',   hex: '#6a4a8c' },
    gray:     { name: '灰',   hex: '#9aa0a6' },
    orange:   { name: '橙',   hex: '#e07b39' },
    pink:     { name: '粉',   hex: '#e08fa8' },
    tan:      { name: '棕褐', hex: '#c9a06a' },
  };

  // 逐张颜色矩阵：完全按官方牌表（66 张 = 基础 58 + 一扩 8）。
  // 每行长度必须等于 CARD_TYPES[type].count；颜色名用上面 COLORS 的键。
  // Pairings 列也已核对：螃蟹↔龙虾、游泳者↔鲨鱼/水母、海星→Duos、海马→Collectors、
  // Cast of Crabs（本实现的 basket/螃蟹篮）→ 螃蟹。
  const CARD_COLORS = {
    /* 基础 58 张 */
    mermaid:    ['white', 'white', 'white', 'white'],
    crab:       ['darkblue', 'darkblue', 'teal', 'teal', 'black', 'yellow', 'yellow', 'green', 'gray'],
    boat:       ['darkblue', 'darkblue', 'teal', 'teal', 'black', 'black', 'yellow', 'yellow'],
    fish:       ['darkblue', 'darkblue', 'teal', 'black', 'black', 'yellow', 'green'],
    shark:      ['darkblue', 'teal', 'black', 'green', 'purple'],
    swimmer:    ['darkblue', 'teal', 'black', 'yellow', 'orange'],
    shell:      ['darkblue', 'teal', 'black', 'yellow', 'green', 'gray'],
    octopus:    ['teal', 'yellow', 'green', 'purple', 'gray'],
    penguin:    ['purple', 'orange', 'pink'],
    sailor:     ['pink', 'tan'],
    lighthouse: ['purple'],
    shoal:      ['gray'],
    colony:     ['green'],
    captain:    ['orange'],
    /* 一扩 8 张 */
    jellyfish:  ['purple', 'pink'],
    lobster:    ['black'],
    starfish:   ['darkblue', 'teal', 'yellow'],
    seahorse:   ['white'],
    basket:     ['green'],
  };

  // 入牌库顺序（美人鱼先占 id 0..3，其余按此序逐张取 CARD_COLORS）
  const NON_MERMAID_ORDER = [
    'crab', 'boat', 'fish', 'shark', 'swimmer',
    'shell', 'octopus', 'penguin', 'sailor',
    'lighthouse', 'shoal', 'colony', 'captain',
  ];

  // Fisher-Yates 洗牌；rng 可注入（测试用），默认 Math.random
  function shuffle(arr, rng) {
    const rand = rng || Math.random;
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  // 构建一副未洗的牌。每张牌：{ id, type, color }，id 全局唯一且确定。
  // 关一扩 = 58 张（id 0..57），开一扩 = 66 张（多出的 8 张 id 58..65，前面 id 不变）。
  function makeCards(withExp) {
    const cards = [];
    let id = 0;
    const push = function (type) {
      const pal = CARD_COLORS[type];
      for (let i = 0; i < CARD_TYPES[type].count; i++) {
        cards.push({ id: id++, type: type, color: pal[i] });
      }
    };
    push('mermaid');
    for (const type of NON_MERMAID_ORDER) push(type);
    if (withExp) for (const type of EXP_ORDER) push(type);
    return cards;
  }

  // 构建并洗匀牌堆（默认含一扩）
  function buildDeck(rng, withExp) {
    return shuffle(makeCards(withExp === undefined ? true : !!withExp), rng);
  }

  // id → { id, type, color } 查表（用全量牌建，因此悔棋/回放/牌表页都能查到）
  const CARD_BY_ID = (function () {
    const m = {};
    for (const c of makeCards(true)) m[c.id] = c;
    return m;
  })();

  global.SPCards = {
    CARD_TYPES: CARD_TYPES,
    COLLECTOR_SCORES: COLLECTOR_SCORES,
    MULTIPLIER_VALUES: MULTIPLIER_VALUES,
    COLORS: COLORS,
    CARD_COLORS: CARD_COLORS,
    EXP_ORDER: EXP_ORDER,
    makeCards: makeCards,
    buildDeck: buildDeck,
    cardById: function (id) { return CARD_BY_ID[id] || null; },
    shuffle: shuffle,
  };
})(typeof window !== 'undefined' ? window : globalThis);
