/* rules.js — 规则引擎（纯函数）：计分、成对枚举、合法动作、轮结算。
   无 DOM 依赖、不修改状态，可在浏览器与 node 中运行。 */
(function (global) {
  'use strict';
  const { CARD_TYPES, COLLECTOR_SCORES, MULTIPLIER_VALUES } = global.SPCards;

  // ---------- 基础统计 ----------

  // 玩家的手牌 + 面前牌合并计分（规则：两处合并计算）
  function allCards(player) {
    return player.hand.concat(player.table);
  }

  function countByType(cards) {
    const m = {};
    for (const c of cards) m[c.type] = (m[c.type] || 0) + 1;
    return m;
  }

  function countByColor(cards) {
    const m = {};
    for (const c of cards) m[c.color] = (m[c.color] || 0) + 1;
    return m;
  }

  // ---------- 计分 ----------

  // 跨类型成对（一扩加入后两项）：key = 两种牌名 sort().join('+')
  const CROSS_PAIRS = {
    'shark+swimmer':      'sharkswimmer',
    'crab+lobster':       'lobstercrab',       // 龙虾 + 螃蟹
    'jellyfish+swimmer':  'jellyfishswimmer',  // 水母 + 游泳者
  };

  // 成对分配：一张牌只能属于一对。先分跨类型组合（两者同值，但先分能让剩下的整牌凑出更多对），
  // 再按同名两两成对。返回 { 组合名: 对数 }。
  function duoCounts(byType) {
    const crab = byType.crab || 0, lobster = byType.lobster || 0;
    const lc = Math.min(lobster, crab);
    const shark = byType.shark || 0, swimmer = byType.swimmer || 0, jf = byType.jellyfish || 0;
    const ss = Math.min(shark, swimmer);
    const m = {
      crab:  Math.floor((crab - lc) / 2),
      boat:  Math.floor((byType.boat || 0) / 2),
      fish:  Math.floor((byType.fish || 0) / 2),
      sharkswimmer: ss,
    };
    if (lc) m.lobstercrab = lc;
    const js = Math.min(jf, swimmer - ss);
    if (js) m.jellyfishswimmer = js;
    return m;
  }

  // 逐项计分明细。返回：
  // { duo: {crab:对数,...}, duoPoints, trio:{n,pts}, collectors:{shell:{n,pts},...}, collectorPoints,
  //   multipliers:{lighthouse:{n,target,pts},...}, multiplierPoints, seahorse,
  //   mermaidPoints, mermaidCounts:[各张美人鱼对应的颜色数], total }
  function scoreDetails(player) {
    const cards = allCards(player);
    const byType = countByType(cards);
    const byColor = countByColor(cards);
    const d = {
      duo: {}, duoPoints: 0,
      trio: { n: 0, pts: 0 },
      collectors: {}, collectorPoints: 0,
      multipliers: {}, multiplierPoints: 0,
      seahorse: null,
      mermaidPoints: 0, mermaidCounts: [],
      total: 0,
    };

    // 成对：每对 1 分（同名×2，以及 鲨鱼+游泳者 / 龙虾+螃蟹 / 水母+游泳者）
    const counts = duoCounts(byType);
    let pairTotal = 0;
    for (const k of Object.keys(counts)) {
      if (counts[k] > 0) { d.duo[k] = counts[k]; d.duoPoints += counts[k]; pairTotal += counts[k]; }
    }

    // 一扩·海星：每张海星贴在一个成对上组成三人组，该组共 3 分（即在对的 1 分上 +2），
    // 代价是取消那一对的效果（效果在 main.js 的打出环节体现，不影响分数）
    const starCount = byType.starfish || 0;
    if (starCount > 0 && pairTotal > 0) {
      d.trio = { n: Math.min(starCount, pairTotal), pts: 0 };
      d.trio.pts = d.trio.n * 2;
      d.duoPoints += d.trio.pts;
    }

    // 收藏牌
    for (const t of Object.keys(COLLECTOR_SCORES)) {
      const n = byType[t] || 0;
      const table = COLLECTOR_SCORES[t];
      const pts = n >= 1 ? table[Math.min(n, table.length) - 1] : 0;
      d.collectors[t] = { n: n, pts: pts, wild: 0 };
      d.collectorPoints += pts;
    }

    // 一扩·海马：代替 1 张收藏牌（须已至少持有该种 1 张），取收益最大的那种，且不超过上限
    if ((byType.seahorse || 0) > 0) {
      let best = null, bestGain = 0;
      for (const t of Object.keys(COLLECTOR_SCORES)) {
        const table = COLLECTOR_SCORES[t];
        const n = byType[t] || 0;
        if (n < 1) continue;
        const gain = table[Math.min(n + 1, table.length) - 1] - table[Math.min(n, table.length) - 1];
        if (gain > bestGain) { bestGain = gain; best = t; }
      }
      if (best && bestGain > 0) {
        const c = d.collectors[best];
        const table = COLLECTOR_SCORES[best];
        c.n += 1; c.wild = 1;
        c.pts = table[Math.min(c.n, table.length) - 1];
        d.collectorPoints += bestGain;
        d.seahorse = { into: best, gain: bestGain };
      }
    }

    // 倍增牌
    for (const t of Object.keys(MULTIPLIER_VALUES)) {
      const def = MULTIPLIER_VALUES[t];
      const n = byType[def.target] || 0;
      const pts = (byType[t] ? n * def.per : 0);
      d.multipliers[t] = { n: n, target: def.target, per: def.per, pts: pts };
      d.multiplierPoints += pts;
    }

    // 美人鱼：每张 = 最多颜色牌数，各张对应不同颜色（贪心取前 k 大的不同颜色）
    const k = byType.mermaid || 0;
    if (k > 0) {
      const counts = Object.keys(byColor).map(function (c) { return byColor[c]; })
        .sort(function (a, b) { return b - a; });
      let sum = 0;
      for (let i = 0; i < Math.min(k, counts.length); i++) {
        sum += counts[i];
        d.mermaidCounts.push(counts[i]);
      }
      d.mermaidPoints = sum;
    }

    d.total = d.duoPoints + d.collectorPoints + d.multiplierPoints + d.mermaidPoints;
    return d;
  }

  function scoreHand(player) {
    return scoreDetails(player).total;
  }

  // 颜色奖励：最多颜色的牌数
  function colorBonus(player) {
    const byColor = countByColor(allCards(player));
    let max = 0;
    for (const c of Object.keys(byColor)) max = Math.max(max, byColor[c]);
    return max;
  }

  // 最多的颜色 key（无牌时返回 null）
  function dominantColor(player) {
    const byColor = countByColor(allCards(player));
    let max = 0, color = null;
    for (const c of Object.keys(byColor)) {
      if (byColor[c] > max) { max = byColor[c]; color = c; }
    }
    return color;
  }

  // ---------- 成对（Duo）枚举 ----------

  // 枚举手牌中可打出的成对组合（打出的具体牌 id 列表），与 duoCounts 的分配口径一致。
  function duoPairsInHand(hand) {
    const idsOf = function (t) { return hand.filter(function (c) { return c.type === t; }).map(function (c) { return c.id; }); };
    const pairs = [];
    const crabs = idsOf('crab'), lobsters = idsOf('lobster');
    const nLC = Math.min(lobsters.length, crabs.length);
    for (let i = 0; i < nLC; i++) pairs.push({ type: 'lobstercrab', ids: [lobsters[i], crabs[i]] });
    for (let i = nLC; i + 1 < crabs.length; i += 2) pairs.push({ type: 'crab', ids: [crabs[i], crabs[i + 1]] });
    for (const t of ['boat', 'fish']) {
      const ids = idsOf(t);
      for (let i = 0; i + 1 < ids.length; i += 2) pairs.push({ type: t, ids: [ids[i], ids[i + 1]] });
    }
    const sharks = idsOf('shark'), swimmers = idsOf('swimmer');
    const nSS = Math.min(sharks.length, swimmers.length);
    for (let i = 0; i < nSS; i++) pairs.push({ type: 'sharkswimmer', ids: [sharks[i], swimmers[i]] });
    const jf = idsOf('jellyfish');
    const nJS = Math.min(jf.length, swimmers.length - nSS);
    for (let i = 0; i < nJS; i++) pairs.push({ type: 'jellyfishswimmer', ids: [jf[i], swimmers[nSS + i]] });
    return pairs;
  }

  // 校验一组牌是否构成合法成对
  function isValidPair(hand, ids) {
    const picked = hand.filter(function (c) { return ids.indexOf(c.id) !== -1; });
    if (picked.length !== 2 || new Set(ids).size !== 2) return false;
    const [a, b] = picked;
    if (a.type === b.type) return (a.type === 'crab' || a.type === 'boat' || a.type === 'fish');
    return !!CROSS_PAIRS[[a.type, b.type].sort().join('+')];
  }

  // 两牌成对的组合名（同名 → 该类型；跨类型 → CROSS_PAIRS 的键）；不合法返回 null
  function pairKindOf(a, b) {
    if (a.type === b.type) return (a.type === 'crab' || a.type === 'boat' || a.type === 'fish') ? a.type : null;
    return CROSS_PAIRS[[a.type, b.type].sort().join('+')] || null;
  }

  // 一扩·海星三人组：1 张海星 + 1 对合法成对牌。返回可打的三人组（按海星与对子的可用数限幅）
  function trioCombosInHand(hand) {
    const stars = hand.filter(function (c) { return c.type === 'starfish'; });
    if (!stars.length) return [];
    const pairs = duoPairsInHand(hand);
    const out = [];
    for (let i = 0; i < Math.min(stars.length, pairs.length); i++) {
      out.push({ type: pairs[i].type, ids: pairs[i].ids.concat([stars[i].id]), pairType: pairs[i].type });
    }
    return out;
  }

  // 校验三张牌是否构成合法三人组（恰好 1 张海星，另两张能成对）
  function isValidTrio(hand, ids) {
    if (ids.length !== 3 || new Set(ids).size !== 3) return false;
    const picked = hand.filter(function (c) { return ids.indexOf(c.id) !== -1; });
    if (picked.length !== 3) return false;
    const stars = picked.filter(function (c) { return c.type === 'starfish'; });
    if (stars.length !== 1) return false;
    return isValidPair(hand, picked.filter(function (c) { return c.type !== 'starfish'; }).map(function (c) { return c.id; }));
  }

  // 点选过程中的中间态：1 张牌、合法对、或“恰好 1 张海星 + 1 张成对牌”都可继续保留
  const DUO_TYPES = Object.keys(CARD_TYPES).filter(function (t) { return CARD_TYPES[t].kind === 'duo'; });
  function selectionPromising(hand, ids) {
    if (ids.length === 0) return false;
    if (ids.length === 1) {
      const c = hand.find(function (x) { return x.id === ids[0]; });
      return !!c;
    }
    if (ids.length === 2) {
      if (isValidPair(hand, ids)) return true;
      const picked = hand.filter(function (c) { return ids.indexOf(c.id) !== -1; });
      if (picked.length !== 2) return false;
      // 两张里只能有一张海星（两张海星永远凑不成三人组，不作为中间态保留）
      return picked.filter(function (c) { return c.type === 'starfish'; }).length === 1 &&
        picked.every(function (c) { return c.type === 'starfish' || DUO_TYPES.indexOf(c.type) !== -1; });
    }
    return isValidTrio(hand, ids);
  }

  // ---------- 摸牌合法动作 ----------

  // 返回 { canDeck, piles:[bool,bool], none:完全无法摸牌 }
  function legalDraw(state) {
    const canDeck = state.deck.length >= 2;
    const piles = [state.discards[0].length > 0, state.discards[1].length > 0];
    return { canDeck: canDeck, piles: piles, none: !canDeck && !piles[0] && !piles[1] };
  }

  // 弃牌目标堆限制：某堆为空则必须弃入该堆；两堆均空时任选（返回 [true,true]）
  function discardTargets(state) {
    const e0 = state.discards[0].length === 0;
    const e1 = state.discards[1].length === 0;
    if (e0 && !e1) return [true, false];
    if (!e0 && e1) return [false, true];
    return [true, true];
  }

  // ---------- 特殊判定 ----------

  // 集齐 4 张美人鱼（手+面前）立即获胜
  function checkMermaidWin(player) {
    return (countByType(allCards(player)).mermaid || 0) >= 4;
  }

  // ---------- 轮结算 ----------

  // mode: 'stop' | 'lastchance'；callerIdx 为宣告者下标。支持 2~4 人（players 数组长度即人数）。
  // 官方规则：
  //   STOP —— 所有人各拿自己的牌分（手+面前），无颜色奖励。
  //   LAST CHANCE —— 宣告者牌分 ≥ 每一个对手则赌赢（宣告者拿牌分+自己颜色奖励，其余对手只拿颜色奖励）；
  //                只要有一个对手牌分严格高于宣告者就赌输（宣告者只拿颜色奖励，其余对手拿牌分）。
  // 返回 { mode, callerIdx, callerWon, scores:[按人], details:[按人], bonuses:[按人] }（bonuses 仅 lastchance 填、stop 恒 0）
  function resolveRound(players, callerIdx, mode) {
    const n = players.length;
    const details = players.map(function (p) { return scoreDetails(p); });
    const res = {
      mode: mode, callerIdx: callerIdx, callerWon: null,
      scores: players.map(function () { return 0; }),
      details: details, bonuses: players.map(function () { return 0; }),
    };

    if (mode === 'stop') {
      for (let i = 0; i < n; i++) res.scores[i] = details[i].total;
      return res;
    }

    // lastchance：先算每人颜色奖励，再比宣告者与所有对手的牌分（平分算宣告者赢，边缘 9）
    const bonusOf = players.map(function (p) { return colorBonus(p); });
    for (let i = 0; i < n; i++) res.bonuses[i] = bonusOf[i];
    let callerWon = true;
    for (let i = 0; i < n; i++) {
      if (i !== callerIdx && details[i].total > details[callerIdx].total) callerWon = false;
    }
    res.callerWon = callerWon;
    for (let i = 0; i < n; i++) {
      if (i === callerIdx) {
        res.scores[i] = callerWon ? details[i].total + bonusOf[i] : bonusOf[i];
      } else {
        res.scores[i] = callerWon ? bonusOf[i] : details[i].total;
      }
    }
    return res;
  }

  global.SPRules = {
    allCards: allCards,
    countByType: countByType,
    countByColor: countByColor,
    duoCounts: duoCounts,
    scoreDetails: scoreDetails,
    scoreHand: scoreHand,
    colorBonus: colorBonus,
    dominantColor: dominantColor,
    duoPairsInHand: duoPairsInHand,
    trioCombosInHand: trioCombosInHand,
    isValidPair: isValidPair,
    pairKindOf: pairKindOf,
    isValidTrio: isValidTrio,
    selectionPromising: selectionPromising,
    legalDraw: legalDraw,
    discardTargets: discardTargets,
    checkMermaidWin: checkMermaidWin,
    resolveRound: resolveRound,
  };
})(typeof window !== 'undefined' ? window : globalThis);
