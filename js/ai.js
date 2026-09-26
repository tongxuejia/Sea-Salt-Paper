/* ai.js — AI 决策：只读状态 → 动作 {action, args}，与人类共用同一动作接口 */
(function (global) {
  'use strict';
  const R = global.SPRules;
  const COLLECTOR_SCORES = global.SPCards.COLLECTOR_SCORES;

  // 估值：现值（成对/收藏/倍增/美人鱼）+ 潜力（未成对孤张、收藏进档、美人鱼）
  function evalCards(hand, table) {
    const p = { hand: hand, table: table };
    let v = R.scoreDetails(p).total;
    const byType = R.countByType(hand.concat(table));
    const dc = R.duoCounts(byType);
    for (const t of ['crab', 'boat', 'fish']) v += ((byType[t] || 0) % 2) * 0.7;
    const base = Math.min(byType.shark || 0, byType.swimmer || 0);
    v += Math.min((byType.shark || 0) - base, (byType.swimmer || 0) - base) * 0.7;
    // 一扩：手上没有可配对象的龙虾/水母算孤张潜力（已配成对的不再叠加，避免高估）
    if ((byType.lobster || 0) > 0 && !dc.lobstercrab) v += 0.7;
    if ((byType.jellyfish || 0) > 0 && !dc.jellyfishswimmer) v += 0.7;
    for (const t of Object.keys(COLLECTOR_SCORES)) {
      const n = byType[t] || 0;
      if (n >= 1 && n < COLLECTOR_SCORES[t].length) {
        v += (COLLECTOR_SCORES[t][n] - COLLECTOR_SCORES[t][n - 1]) * 0.4;
      }
    }
    v += (byType.mermaid || 0) * 1.5;
    return v;
  }

  // 加入一张牌的边际价值
  function marginal(hand, table, c) {
    return evalCards(hand.concat([c]), table) - evalCards(hand, table);
  }

  function decide(state) {
    const me = state.players[state.current];
    const opp = state.players[1 - state.current];

    switch (state.phase) {
      case 'draw': {
        const legal = R.legalDraw(state);
        let bestPile = -1, bestDelta = -Infinity;
        for (let i = 0; i < 2; i++) {
          if (!legal.piles[i]) continue;
          const top = state.discards[i][state.discards[i].length - 1];
          const dv = marginal(me.hand, me.table, top);
          if (dv > bestDelta) { bestDelta = dv; bestPile = i; }
        }
        if (legal.canDeck) {
          // 抽2留1的期望增益估计（保守）
          const deckEst = 0.4 + (me.hand.length < 3 ? 0.5 : 0.2);
          if (bestPile === -1 || deckEst >= bestDelta) return { action: 'drawFromDeck', args: [] };
        }
        if (bestPile >= 0) return { action: 'takeDiscard', args: [bestPile] };
        return { action: 'drawFromDeck', args: [] };
      }

      case 'keep': {
        const a = state.pendingDraw[0], b = state.pendingDraw[1];
        const da = marginal(me.hand, me.table, a);
        const db = marginal(me.hand, me.table, b);
        return { action: 'keepCard', args: [da >= db ? a.id : b.id] };
      }

      case 'discard': {
        // 弃的牌固定（pendingKeep），只选弃入哪一堆：两堆均可时选较大的堆（利于后续螃蟹翻找混淆）
        const t = R.discardTargets(state);
        let pile;
        if (!t[0]) pile = 1;
        else if (!t[1]) pile = 0;
        else pile = state.discards[0].length >= state.discards[1].length ? 0 : 1;
        return { action: 'discardTo', args: [pile] };
      }

      case 'duo': {
        if (state.pairPlays >= 12) return { action: 'skipDuos', args: [] };
        // 一扩·海星三人组：只在“那一对的效果本来就不值钱”时才用海星贴上去（效果会被取消）
        const trios = R.trioCombosInHand(me.hand);
        for (const tr of trios) {
          const dead = (tr.pairType === 'crab' && !state.discards[0].length && !state.discards[1].length) ||
            (tr.pairType === 'fish' && !state.deck.length) ||
            (tr.pairType === 'sharkswimmer' && !opp.hand.length) ||
            (tr.pairType === 'lobstercrab' && !state.deck.length) ||
            tr.pairType === 'jellyfishswimmer';
          if (dead) return { action: 'playTrio', args: [tr.ids] };
        }
        const pairs = R.duoPairsInHand(me.hand);
        if (!pairs.length) return { action: 'skipDuos', args: [] };
        for (const pr of pairs) {
          if (pr.type === 'boat') return { action: 'playPair', args: [pr.ids] };
          if (pr.type === 'fish' && state.deck.length > 0) return { action: 'playPair', args: [pr.ids] };
          if (pr.type === 'sharkswimmer' && opp.hand.length > 0) return { action: 'playPair', args: [pr.ids] };
          // 一扩·龙虾：牌库有牌就值得翻 5 挑 1
          if (pr.type === 'lobstercrab' && state.deck.length > 0) return { action: 'playPair', args: [pr.ids] };
          // 一扩·水母：锁住对手下一回合（对手无法摸牌时效果无意义）
          if (pr.type === 'jellyfishswimmer' && !R.legalDraw(state).none) return { action: 'playPair', args: [pr.ids] };
          if (pr.type === 'crab') {
            let best = 0;
            for (const pile of state.discards) {
              for (const c of pile) best = Math.max(best, marginal(me.hand, me.table, c));
            }
            if (best >= 1.0) return { action: 'playPair', args: [pr.ids] };
          }
        }
        return { action: 'skipDuos', args: [] };
      }

      // 一扩·龙虾：从牌库顶 5 张里挑价值最高的一张（人类看不到 AI 在选什么）
      case 'lobsterPick': {
        let best = null, bv = -Infinity;
        for (const c of state.pendingLobster) {
          const v = marginal(me.hand, me.table, c);
          if (v > bv) { bv = v; best = c; }
        }
        if (!best) return { action: 'skipDuos', args: [] }; // 兜底（不应发生）
        return { action: 'lobsterPick', args: [best.id] };
      }

      case 'crabPick': {
        let best = null, bi = 0, bv = -Infinity;
        for (let i = 0; i < 2; i++) {
          for (const c of state.discards[i]) {
            const v = marginal(me.hand, me.table, c);
            if (v > bv) { bv = v; best = c; bi = i; }
          }
        }
        if (!best) return { action: 'skipDuos', args: [] }; // 兜底（不应发生）
        return { action: 'crabPick', args: [bi, best.id] };
      }

      case 'call': {
        const my = R.scoreHand(me);
        const oppEst = R.scoreHand({ hand: [], table: opp.table }) + opp.hand.length * 0.8;
        // 牌库将尽：本轮可能无人得分，尽快停
        if (state.deck.length <= 2) {
          return { action: Math.random() < 0.85 ? 'callStop' : 'callLastChance', args: [] };
        }
        if (my >= 10 && my >= oppEst + 2 && Math.random() < 0.75) return { action: 'callLastChance', args: [] };
        if (my >= oppEst + 1 && Math.random() < 0.55) return { action: 'callStop', args: [] };
        if (my >= 13) return { action: Math.random() < 0.5 ? 'callStop' : 'callLastChance', args: [] };
        return { action: 'passCall', args: [] };
      }
    }
    return { action: 'skipDuos', args: [] };
  }

  global.SPAI = { decide: decide, evalCards: evalCards };
})(typeof window !== 'undefined' ? window : globalThis);
