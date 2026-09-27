/* main.js — 游戏状态机与控制器。所有动作经此处校验后修改状态；
   UI（浏览器）与 AI 共用同一动作接口。无 DOM 依赖（可在 node 中驱动模拟）。 */
(function (global) {
  'use strict';
  const { buildDeck, CARD_TYPES, COLORS } = global.SPCards;
  const R = global.SPRules;
  const HUMAN = 0;          // 玩家固定在 0；其余下标 1..n-1 都是电脑
  const MAX_PAIR_PLAYS = 12;  // 单回合成对上限（防呆）

  // 官方胜利分随人数递减：2/3/4 人 = 40/35/30（本实现最多支持 3 人）
  function targetFor(n) { return n >= 4 ? 30 : n === 3 ? 35 : 40; }

  let S = null;
  const listeners = [];

  // ---------- 悔棋：动作前快照栈 ----------
  // 只记录“人类玩家在自己回合里做决定之前”的完整状态；一旦把行动权交出去（换手）就清空，
  // 所以悔棋只能撤“当前这一手”，不能看了 AI 的回应再反悔，结算后也不能反悔宣告。
  let history = [];
  const HISTORY_LIMIT = 40;
  const UNDO_PHASES = { draw: 1, keep: 1, discard: 1, duo: 1, crabPick: 1, lobsterPick: 1, targetPick: 1, call: 1 };
  function clearHistory() { history = []; }
  function snapshot() {
    if (!S || S.current !== HUMAN) return;
    // fx 是一次性的飞牌动画标记，不能入快照，否则悔棋会重放一次飞牌
    history.push(JSON.stringify(S, function (k, v) { return k === 'fx' ? undefined : v; }));
    if (history.length > HISTORY_LIMIT) history.shift();
  }
  function canUndo() {
    return !!S && S.current === HUMAN && !!UNDO_PHASES[S.phase] && history.length > 0;
  }
  function undo() {
    if (!canUndo()) return false;
    S = JSON.parse(history.pop());
    S.fx = null;
    log('悔棋：撤回上一步操作', 'sys');
    emit();
    return true;
  }

  // ---------- 工具 ----------
  function cname(c) { return CARD_TYPES[c.type].name + '·' + COLORS[c.color].name; }
  function pairName(kind) {
    if (kind === 'sharkswimmer') return '鲨鱼+游泳者';
    if (kind === 'shark') return '鲨鱼+游泳者';
    if (kind === 'lobstercrab') return '龙虾+螃蟹';
    if (kind === 'jellyfishswimmer') return '水母+游泳者';
    return CARD_TYPES[kind] ? CARD_TYPES[kind].name + '×2' : kind;
  }
  function log(text, side) {
    const s = side || 'sys';
    // by 记录这条日志出自哪个玩家下标（sys 为 -1），供 UI 给每个 AI 单独显示气泡与日志前缀
    S.log.push({ text: text, side: s, by: s === 'sys' ? -1 : S.current });
    if (S.log.length > 30) S.log.shift();
  }
  function logP(text) { log(text, S.current === HUMAN ? 'you' : 'ai'); }

  // ---------- 多人辅助 ----------
  function isAI(idx) { return idx !== HUMAN; }
  function nextPlayer(idx) { return (idx + 1) % S.numPlayers; }
  // 玩家显示名：0=你；2 人局 AI 叫“AI”，3 人局区分“AI1 / AI2”
  function playerLabel(idx) {
    const p = S && S.players && S.players[idx];
    return p && p.label ? p.label : (idx === HUMAN ? '你' : 'AI');
  }
  // 飞牌动画的“手牌区”标识：人类手牌与每个 AI 的手牌区各一个 key（ui.js FX_SOURCE 同名）
  function handZone(idx) { return idx === HUMAN ? 'playerHand' : ('aiHand' + idx); }
  // Last Chance 窗口内已亮牌受保护的玩家（宣告者 + 已打完最终回合的对手），不能被偷/被锁
  function isProtected(idx) { return !!S.lastChance && S.lcProtected.indexOf(idx) !== -1; }
  // 可作为偷牌/锁手目标的对手下标（排除自己与受保护者）
  function stealTargets() {
    const out = [];
    for (let i = 0; i < S.numPlayers; i++) {
      if (i !== S.current && !isProtected(i)) out.push(i);
    }
    return out;
  }

  // ---------- 状态构建 ----------
  function setupBoard() {
    history = []; // 新一轮开始，上一轮的悔棋快照作废
    S.deck = buildDeck(null, S.useExp);
    S.discards = [[S.deck.pop()], [S.deck.pop()]]; // 无论几人都是 2 个弃牌堆（官方）
    for (const p of S.players) { p.hand = []; p.table = []; }
    S.pendingDraw = null; S.pendingKeep = null; S.pendingLobster = null;
    S.extraTurns = 0; S.pairPlays = 0;
    S.lastChance = null; S.lcProtected = []; S.revealIdx = -1; S.pendingEffect = null;
    S.jellyLock = null; // 锁手只作“下一回合”，跳轮不延续
    S.phase = 'draw';
  }
  
  // opts.useExp：是否混入一扩 Extra Salt 的 8 张牌（默认开）
  // opts.aiCount：电脑对手数 1 或 2（默认 1，即 2 人局，保持所有旧行为与测试不变）
  function newGame(opts) {
    const useExp = !(opts && opts.useExp === false);
    const aiCount = (opts && opts.aiCount === 2) ? 2 : 1;
    const n = 1 + aiCount;
    const players = [{ hand: [], table: [], total: 0, label: '你' }];
    for (let k = 1; k < n; k++) {
      players.push({ hand: [], table: [], total: 0, label: aiCount >= 2 ? ('AI' + k) : 'AI' });
    }
    S = {
      deck: [], discards: [[], []],
      players: players,
      numPlayers: n,
      round: 1,
      current: Math.floor(Math.random() * n), // 首局随机先手
      phase: 'draw',
      extraTurns: 0, pairPlays: 0,
      pendingDraw: null, pendingKeep: null, pendingLobster: null, pendingEffect: null,
      lastChance: null, lcProtected: [], revealIdx: -1,
      lastToAct: HUMAN, roundEnder: null,
      roundResult: null, gameOver: null,
      log: [], fast: false,
      useExp: useExp, jellyLock: null,
      target: targetFor(n),
    };
    setupBoard();
    log('—— 第 1 轮开始，' + playerLabel(S.current) + ' 先手 ——', 'sys');
    log(useExp ? '牌库 66 张（含一扩 Extra Salt 8 张）' : '牌库 58 张（仅基础牌）', 'sys');
    emit();
  }
  
  // ---------- 发布 ----------
  function emit() {
    for (const fn of listeners) fn(S);
    maybeAI();
  }
  
  // AI 自动驱动（仅浏览器）；node 模拟用 tick() 手动驱动
  function maybeAI() {
    if (typeof document === 'undefined') return;
    if (!S || !isAI(S.current)) return;
    if (S.phase === 'roundOver' || S.phase === 'gameOver') return;
    const delay = S.fast ? 90 : 550 + Math.random() * 550;
    setTimeout(function () {
      if (S && isAI(S.current) && S.phase !== 'roundOver' && S.phase !== 'gameOver') tick();
    }, delay);
  }
  
  // AI 执行一步决策
  function tick() {
    if (!S || !isAI(S.current)) return;
    const d = global.SPAI.decide(S);
    const fn = SPGame[d.action];
    if (typeof fn === 'function') fn.apply(null, d.args);
    else emit();
  }

  // ---------- 美人鱼即胜 ----------
  // 返回 true 表示游戏已结束（调用方应立即 emit 并返回）
  function checkWin(pIdx) {
    if (R.checkMermaidWin(S.players[pIdx])) {
      S.gameOver = { winner: pIdx, byMermaid: true };
      S.phase = 'gameOver';
      log(playerLabel(pIdx) + ' 集齐 4 张美人鱼，直接获胜！', 'sys');
      return true;
    }
    return false;
  }

  // ---------- 动作（人类与 AI 共用） ----------

  // 飞牌动画标记：牌进入当前玩家手牌时记录来源/去向/是否公开（AI 默认飞背面以隐藏信息）
  function setFx(card, fromKey, faceUp) {
    S.fx = { from: fromKey, to: handZone(S.current), cardId: card.id, card: card, faceUp: !!faceUp };
  }

  // 摸牌 A：从牌库抽 2 张
  function drawFromDeck() {
    if (!S || S.phase !== 'draw' || S.deck.length < 2) return;
    snapshot();
    S.pendingDraw = [S.deck.pop(), S.deck.pop()];
    S.phase = 'keep';
    logP(S.current === HUMAN ? '从牌库抽了 2 张' : '从牌库抽了 2 张（暗看）');
    emit();
  }

  // 摸牌 B：拿某弃牌堆顶
  function takeDiscard(pileIdx) {
    if (!S || S.phase !== 'draw' || !S.discards[pileIdx].length) return;
    snapshot();
    const c = S.discards[pileIdx].pop();
    S.players[S.current].hand.push(c);
    setFx(c, 'discard' + pileIdx, true); // 弃牌堆顶是公开信息，飞正面
    logP('拿走弃牌堆 ' + (pileIdx + 1) + ' 顶的 ' + cname(c));
    S.phase = 'duo';
    if (checkWin(S.current)) { emit(); return; }
    emit();
  }

  // 抽 2 后选择保留哪张
  function keepCard(cardId) {
    if (!S || S.phase !== 'keep' || !S.pendingDraw) return;
    const idx = S.pendingDraw.findIndex(function (c) { return c.id === cardId; });
    if (idx < 0) return;
    snapshot();
    const kept = S.pendingDraw[idx];
    S.players[S.current].hand.push(kept);
    setFx(kept, 'deck', S.current === HUMAN); // 牌库摸的：人类看得到自己的，AI 飞背面
    S.pendingKeep = S.pendingDraw[1 - idx];
    S.pendingDraw = null;
    S.phase = 'discard';
    if (S.current === HUMAN) logP('保留了 ' + cname(kept));
    emit();
  }

  // 将未保留的那张弃入某堆
  function discardTo(pileIdx) {
    if (!S || S.phase !== 'discard' || !S.pendingKeep) return;
    const t = R.discardTargets(S);
    if (!t[pileIdx]) return;
    snapshot();
    const c = S.pendingKeep;
    S.discards[pileIdx].push(c);
    logP('弃置 ' + cname(c) + ' 到弃牌堆 ' + (pileIdx + 1));
    S.pendingKeep = null;
    S.phase = 'duo';
    emit();
  }

  // 决定 鲨鱼偷牌 / 水母锁手 作用到哪个对手：
  //   返回数字 = 立即对该下标生效；返回 'PICK' = 需人类点选目标（仅多人局）；返回 -1 = 无可作用对象（落空）。
  //   2 人局只有1 个对手→自动；AI 会传 targetIdx；人类在 >2 人不传→进 targetPick 阶段。
  function resolveEffectTarget(targetIdx) {
    const cands = stealTargets();
    if (!cands.length) return -1;
    if (S.numPlayers <= 2) return cands[0];
    if (targetIdx == null) return 'PICK';
    return cands.indexOf(targetIdx) !== -1 ? targetIdx : cands[0];
  }

  // 执行偷牌：从 target 手牌随机拿 1 张入自己手。返回 true 表示因此集齐美人鱼游戏已结束。
  function applySteal(target) {
    const me = S.players[S.current];
    const opp = S.players[target];
    if (!opp.hand.length) { logP('→ 对手没有手牌，效果落空'); return false; }
    const i = Math.floor(Math.random() * opp.hand.length);
    const stolen = opp.hand.splice(i, 1)[0];
    me.hand.push(stolen);
    setFx(stolen, handZone(target), S.current === HUMAN); // 人类可看到偷到的牌正面；AI 偷飞背面
    // 人类可看到被偷的牌名；AI 偷任何人时不暂露具体哪张（别人手牌本就不公开）
    logP(S.current === HUMAN ? '→ 从 ' + playerLabel(target) + ' 手中偷走 1 张：' + cname(stolen) : '→ 从对手手中偷走 1 张牌');
    return checkWin(S.current);
  }

  // 执行锁手： target 下一回合只能摸 1 张、不出牌不宣告
  function applyLock(target) {
    S.jellyLock = target;
    logP('→ ' + playerLabel(target) + ' 下一个回合只能从牌库摸 1 张（不出牌、不可宣告）');
  }

  // 打出成对（targetIdx 仅 鲨鱼/水母 在多人局需要；AI 会传，人类不传则弹层选）
  function playPair(ids, targetIdx) {
    if (!S || S.phase !== 'duo') return;
    if (S.pairPlays >= MAX_PAIR_PLAYS) return;
    const p = S.players[S.current];
    if (!R.isValidPair(p.hand, ids)) return;
    snapshot();
    const picked = p.hand.filter(function (c) { return ids.indexOf(c.id) !== -1; });
    p.hand = p.hand.filter(function (c) { return ids.indexOf(c.id) === -1; });
    p.table.push(picked[0], picked[1]);
    S.pairPlays++;
    const kind = R.pairKindOf(picked[0], picked[1]) || picked[0].type;
    logP('打出成对：' + pairName(kind));

    if (kind === 'boat') {
      S.extraTurns++;
      logP('→ 已记下额外回合：本回合结束（点“跳过/结束回合”）后再行动一回合');
    } else if (kind === 'fish') {
      if (S.deck.length) {
        const c = S.deck.pop();
        p.hand.push(c);
        setFx(c, 'deck', S.current === HUMAN);
        logP('→ 从牌库顶抽入 1 张');
        if (checkWin(S.current)) { emit(); return; }
      } else logP('→ 牌库已空，效果落空');
    } else if (kind === 'sharkswimmer') {
      const t = resolveEffectTarget(targetIdx);
      if (t === 'PICK') { S.pendingEffect = { kind: 'sharkswimmer' }; S.phase = 'targetPick'; emit(); return; }
      if (t < 0) { logP('→ 无可偷目标（对手都无手牌或已亮牌受保护），效果落空'); }
      else if (applySteal(t)) { emit(); return; }
    } else if (kind === 'crab') {
      if (S.discards[0].length || S.discards[1].length) {
        S.phase = 'crabPick';
        logP('→ 翻看弃牌堆，选 1 张入手');
      } else logP('→ 弃牌堆全空，效果落空');
    } else if (kind === 'lobstercrab') {
      // 一扩·龙虾：看牌库顶 5 张（不足则看现有张数），选 1 张入手，其余放回并重洗牌库
      const n = Math.min(5, S.deck.length);
      if (n) {
        S.pendingLobster = S.deck.splice(S.deck.length - n, n);
        S.phase = 'lobsterPick';
        logP('→ 翻看牌库顶 ' + n + ' 张，选 1 张入手（其余放回后重洗）');
      } else logP('→ 牌库已空，效果落空');
    } else if (kind === 'jellyfishswimmer') {
      // 一扩·水母：选一个对手，其下一回合只能从牌库摸 1 张，不出牌、不宣告
      const t = resolveEffectTarget(targetIdx);
      if (t === 'PICK') { S.pendingEffect = { kind: 'jellyfishswimmer' }; S.phase = 'targetPick'; emit(); return; }
      if (t < 0) { logP('→ 无可锁对手（都已亮牌受保护），效果落空'); }
      else applyLock(t);
    }
    emit();
  }

  // 人类在多人局为 鲨鱼/水母 选目标（phase === 'targetPick'）。效果接回 duo。
  function pickTarget(playerIdx) {
    if (!S || S.phase !== 'targetPick' || !S.pendingEffect) return;
    // 先校验目标合法再清空 pendingEffect：否则误点非法目标会把待决效果抹掉、弹层永久卡住无法再选
    if (stealTargets().indexOf(playerIdx) === -1) return;
    const kind = S.pendingEffect.kind;
    S.pendingEffect = null;
    S.phase = 'duo';
    let ended = false;
    if (kind === 'sharkswimmer') ended = applySteal(playerIdx);
    else applyLock(playerIdx);
    emit();
    if (ended) return; // applySteal 内部 checkWin 已将 phase 置 gameOver
  }

  // 一扩·海星三人组：1 张海星 + 1 对成对牌打到面前，该组共 3 分，但取消那一对的效果
  function playTrio(ids) {
    if (!S || S.phase !== 'duo') return;
    if (S.pairPlays >= MAX_PAIR_PLAYS) return;
    const p = S.players[S.current];
    if (!R.isValidTrio(p.hand, ids)) return;
    snapshot();
    const picked = p.hand.filter(function (c) { return ids.indexOf(c.id) !== -1; });
    p.hand = p.hand.filter(function (c) { return ids.indexOf(c.id) === -1; });
    // 海星排到最后，与它绑定的两张牌在面前相邻
    const star = picked.filter(function (c) { return c.type === 'starfish'; });
    const duo = picked.filter(function (c) { return c.type !== 'starfish'; });
    p.table.push(duo[0], duo[1], star[0]);
    S.pairPlays++;
    logP('打出三人组：' + pairName(R.pairKindOf(duo[0], duo[1])) + ' + 海星（3 分，不触发效果）');
    emit();
  }

  // 一扩·龙虾效果：从翻开的牌库顶牌里选 1 张，其余放回牌库并重洗
  function lobsterPick(cardId) {
    if (!S || S.phase !== 'lobsterPick' || !S.pendingLobster) return;
    const idx = S.pendingLobster.findIndex(function (c) { return c.id === cardId; });
    if (idx < 0) return;
    snapshot();
    const picked = S.pendingLobster.splice(idx, 1)[0];
    S.players[S.current].hand.push(picked);
    setFx(picked, 'deck', S.current === HUMAN);
    // 余牌放回后整库重洗（官方规则：returned to the deck and shuffled）
    S.deck = shuffleDeck(S.deck.concat(S.pendingLobster));
    S.pendingLobster = null;
    logP(S.current === HUMAN ? '从龙虾看到的 5 张里拿走了 ' + cname(picked) + '，其余放回牌库重洗' : '从牌库顶 5 张里拿了 1 张，其余放回重洗');
    S.phase = 'duo';
    if (checkWin(S.current)) { emit(); return; }
    emit();
  }

  // 洗牌需要可注入的 rng，但状态机里用默认随机即可
  function shuffleDeck(arr) { return global.SPCards.shuffle(arr); }

  // 螃蟹效果：从弃牌堆选 1 张
  function crabPick(pileIdx, cardId) {
    if (!S || S.phase !== 'crabPick') return;
    const pile = S.discards[pileIdx];
    const idx = pile.findIndex(function (c) { return c.id === cardId; });
    if (idx < 0) return;
    snapshot();
    const c = pile.splice(idx, 1)[0];
    S.players[S.current].hand.push(c);
    setFx(c, 'discard' + pileIdx, S.current === HUMAN); // 蟹拿是暗拿：AI 飞背面
    logP('从弃牌堆拿走 1 张牌（不公开）');
    S.phase = 'duo';
    if (checkWin(S.current)) { emit(); return; }
    emit();
  }

  // 结束成对阶段 → 进入宣告或结束回合
  function skipDuos() {
    if (!S || S.phase !== 'duo') return;
    snapshot();
    const inFinalTurn = S.lastChance && S.current !== S.lastChance.caller;
    if (!inFinalTurn && R.scoreHand(S.players[S.current]) >= 7) {
      S.phase = 'call';
    } else {
      endTurn();
      return;
    }
    emit();
  }

  // 宣告 Stop
  function callStop() {
    if (!S || S.phase !== 'call') return;
    snapshot();
    logP('宣告：STOP（本轮立即结算，无颜色奖励）');
    S.roundEnder = S.current;
    S.lastToAct = S.current;
    const res = R.resolveRound(S.players, S.current, 'stop');
    finishRound(res);
  }

  // 宣告 Last Chance：亮出手牌（受保护），其余每个对手各打一个最终回合后结算
  function callLastChance() {
    if (!S || S.phase !== 'call') return;
    snapshot();
    logP('宣告：LAST CHANCE（亮出手牌，赌自己最高）');
    S.roundEnder = S.current;
    S.lastChance = { caller: S.current };
    S.lcProtected = [S.current];                 // 宣告者已亮牌、从此刻起不能被偷/被锁
    if (isAI(S.current)) S.revealIdx = S.current; // AI 宣告者亮出手牌
    clearHistory(); // 行动权已交出，宣告之前的操作不再可悔
    beginOrResolveFinalTurn();
  }

  // Last Chance 窗口：推进到下一个该打最终回合的对手（回到宣告者则结算）。
  // 进入时 S.current 为刚宣告或刚打完最终回合的玩家。
  function beginOrResolveFinalTurn() {
    const caller = S.lastChance.caller;
    const nxt = nextPlayer(S.current);
    if (nxt === caller) {
      const res = R.resolveRound(S.players, caller, 'lastchance');
      log('最终回合结束，结算', 'sys');
      finishRound(res);
      return;
    }
    S.current = nxt;
    S.pairPlays = 0; S.phase = 'draw'; S.fast = false; S.extraTurns = 0;
    clearHistory();
    if (R.legalDraw(S).none) {          // 该对手无牌可摸 → 视作空最终回合，保护后继续推进
      if (S.lcProtected.indexOf(S.current) === -1) S.lcProtected.push(S.current);
      beginOrResolveFinalTurn();
      return;
    }
    if (consumeJellyLock()) return;     // 被水母定住：只能摸 1 张，endTurn 会接手推进
    emit();
  }

  // 放弃宣告，结束回合
  function passCall() {
    if (!S || S.phase !== 'call') return;
    snapshot();
    logP('选择继续攒分');
    endTurn();
  }

  // ---------- 回合轮转与轮结束 ----------

  // 一扩·水母锁手：被定住的玩家本回合只能从牌库摸 1 张，不出牌、不宣告，直接过拍
  // 返回 true 表示本回合已被消耗（endTurn 已接管后续流转），调用方应立即 return
  function consumeJellyLock() {
    if (!S || S.jellyLock === null || S.jellyLock !== S.current) return false;
    S.jellyLock = null;
    const p = S.players[S.current];
    if (S.deck.length) {
      const c = S.deck.pop();
      p.hand.push(c);
      setFx(c, 'deck', S.current === HUMAN);
      logP('被水母定住：本回合只能从牌库摸 1 张，不出牌也不宣告');
      if (checkWin(S.current)) { emit(); return true; }
    } else {
      logP('被水母定住，且牌库已空：本回合摸不到牌');
    }
    endTurn();
    return true;
  }

  function endTurn() {
    S.lastToAct = S.current;
    // 边缘4：回合结束时牌库空 → 轮立即结束，无人得分（含额外回合后）
    if (S.deck.length === 0) {
      log('牌库已空，本轮立即结束，无人得分', 'sys');
      roundEndNoScore();
      return;
    }
    // Last Chance 窗口：当前玩家刚打完最终回合 → 亮牌受保护，推进到下一个对手（回到宣告者则结算）
    if (S.lastChance) {
      if (S.lcProtected.indexOf(S.current) === -1) S.lcProtected.push(S.current);
      beginOrResolveFinalTurn();
      return;
    }
    if (S.extraTurns > 0) {
      S.extraTurns--;
      S.pairPlays = 0;
      S.phase = 'draw';
      logP('使用额外回合');
    } else {
      S.current = nextPlayer(S.current);
      clearHistory(); // 换手即过账：上一手的快照作废
      S.pairPlays = 0;
      S.phase = 'draw';
      S.fast = false; // 换人后恢复常速
    }
    // 边缘3：新回合无法摸牌 → 轮结束无人得分
    if (R.legalDraw(S).none) {
      log('无牌可摸，本轮结束，无人得分', 'sys');
      roundEndNoScore();
      return;
    }
    if (consumeJellyLock()) return; // 新回合被水母锁手：自动完成并交棒
    emit();
  }

  function finishRound(res) {
    S.roundResult = res;
    for (let i = 0; i < S.numPlayers; i++) S.players[i].total += res.scores[i];
    S.phase = 'roundOver';
    emit();
  }

  function roundEndNoScore() {
    S.roundEnder = S.current;
    const z = function () { return S.players.map(function () { return 0; }); };
    S.roundResult = { noScore: true, mode: 'none', callerIdx: S.current, scores: z(), details: S.players.map(function () { return null; }), bonuses: z() };
    S.phase = 'roundOver';
    emit();
  }

  // 结算弹层点"继续"后
  function continueAfterRound() {
    if (!S || S.phase !== 'roundOver') return;
    let maxTotal = -Infinity;
    for (const p of S.players) maxTotal = Math.max(maxTotal, p.total);
    if (maxTotal >= S.target) {
      // 赢家 = 总分最高者；平分时按上一轮实发分更高者胜（官方），仍并列则最后行动者胜
      const tied = [];
      for (let i = 0; i < S.numPlayers; i++) if (S.players[i].total === maxTotal) tied.push(i);
      let winner = tied[0];
      if (tied.length > 1) {
        const last = (S.roundResult && S.roundResult.scores) ? S.roundResult.scores : [];
        tied.sort(function (a, b) { return (last[b] || 0) - (last[a] || 0); });
        winner = ((last[tied[0]] || 0) === (last[tied[1]] || 0)) ? S.lastToAct : tied[0];
      }
      S.gameOver = { winner: winner, byMermaid: false };
      S.phase = 'gameOver';
      emit();
      return;
    }
    S.round++;
    S.current = nextPlayer(S.roundEnder); // 上轮结束者的下家先手
    setupBoard();
    log('—— 第 ' + S.round + ' 轮开始，' + playerLabel(S.current) + ' 先手 ——', 'sys');
    if (R.legalDraw(S).none) { roundEndNoScore(); return; }
    emit();
  }

  // 点击桌面加速 AI
  function speedUp() { if (S) S.fast = true; }

  const SPGame = {
    get state() { return S; },
    HUMAN: HUMAN,
    onChange: function (fn) { listeners.push(fn); },
    newGame: newGame,
    drawFromDeck: drawFromDeck,
    takeDiscard: takeDiscard,
    keepCard: keepCard,
    discardTo: discardTo,
    playPair: playPair,
    playTrio: playTrio,
    crabPick: crabPick,
    lobsterPick: lobsterPick,
    pickTarget: pickTarget,
    skipDuos: skipDuos,
    undo: undo,
    canUndo: canUndo,
    callStop: callStop,
    callLastChance: callLastChance,
    passCall: passCall,
    continueAfterRound: continueAfterRound,
    speedUp: speedUp,
    tick: tick,
    // 换手（UI 不直接调，仅 tests.js 需要验证水母锁手的自动过回合）
    endTurn: endTurn,
  };

  global.SPGame = SPGame;
})(typeof window !== 'undefined' ? window : globalThis);
