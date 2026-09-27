/* ui.js — 渲染与交互：只读渲染状态，点击经 data-action 委托调用 SPGame 动作 */
(function (global) {
  'use strict';
  const { CARD_TYPES, COLORS, MULTIPLIER_VALUES } = global.SPCards;
  const R = global.SPRules;

  // 卡面上一行短提示（title / 牌表页摘要）
  const EFFECT_TEXT = {
    crab: '成对：翻看弃牌堆拿1张',
    boat: '成对：结束本回合后再行动一回合',
    fish: '成对：抽牌库顶1张',
    shark: '成对(与游泳者)：偷对手1张',
    swimmer: '成对(与鲨鱼)：偷对手1张',
    mermaid: '每张=最多颜色牌数；集齐4张即胜',
    shell: '收藏 1-6张: 0/2/4/6/8/10',
    octopus: '收藏 1-5张: 0/3/6/9/12',
    penguin: '收藏 1-3张: 1/3/5',
    sailor: '收藏 2张=5分',
    lighthouse: '每张小船 +1',
    shoal: '每张鱼 +1',
    colony: '每张企鹅 +2',
    captain: '每张水手 +3',
    // —— 一扩 Extra Salt ——
    jellyfish: '与游泳者成对：锁手对手下回合',
    lobster: '与螃蟹成对：看牌库顶5张挑1张',
    starfish: '贴任意一对：该对变 3 分但无效果',
    seahorse: '代替 1 张已持有的收藏牌',
    basket: '每张螃蟹 +1',
  };

  // 完整说明（点牌弹层 / 规则书 / 牌表页共用）
  const EFFECT_LONG = {
    crab: '每 2 张算 1 对得 1 分（不打也计分）。打到面前时：翻看两个弃牌堆的全部牌，暗取 1 张入手（对手看不到你拿了什么）。',
    boat: '每 2 张算 1 对得 1 分。打到面前时：本回合结束后立即再行动一回合（可连续凑对、连续宣告）。',
    fish: '每 2 张算 1 对得 1 分。打到面前时：从牌库顶拿 1 张入手（牌库已空则效果落空）。',
    shark: '与 1 张游泳者算 1 组得 1 分。打到面前时：从对手手里随机偷 1 张（你看不到偷的是哪张）。',
    swimmer: '与 1 张鲨鱼算 1 组得 1 分。打到面前时：从对手手里随机偷 1 张。一扩开放后，游泳者也能与水母成对（二选一，一张游泳者只能用一次）。',
    mermaid: '每张值“你最多颜色的那一种有几张牌”的分，各张对应不同颜色（取前 k 大的颜色）。集齐 4 张立即获胜。',
    shell: '1-6 张分别得 0/2/4/6/8/10 分（只有 1 张不得分）。',
    octopus: '1-5 张分别得 0/3/6/9/12 分（只有 1 张不得分）。',
    penguin: '1-3 张分别得 1/3/5 分（第 1 张就值 1 分）。',
    sailor: '1 张 0 分，2 张 5 分。',
    lighthouse: '每持有 1 张灯塔，面前的每张小船额外 +1 分。',
    shoal: '每持有 1 张鱼群，面前的每张鱼额外 +1 分。',
    colony: '每持有 1 张企鹅栖息地，面前的每张企鹅额外 +2 分。',
    captain: '每持有 1 张船长，面前的每张水手额外 +3 分。',
    jellyfish: '【一扩】与 1 张游泳者算 1 组得 1 分。打到面前时：对手下一个回合只能从牌库摸 1 张，不能出牌、也不能宣告（摸完直接交棒）。',
    lobster: '【一扩】与 1 张螃蟹算 1 组得 1 分。打到面前时：翻开牌库顶 5 张（不足那么多个就看现有张数），选 1 张入手，其余放回牌库并重洗整库。',
    starfish: '【一扩】与任意“已成对的两张”一起打到面前，算一组三人组，共 3 分（原本的 1 分 + 海星 2 分），代价是取消那一对的效果。手里凑齐一对时，海星不打出也先把 2 分计入分数。',
    seahorse: '【一扩】代替一张你已至少持有 1 张的收藏牌（贝壳/章鱼/企鹅/水手任一种），按多 1 张重算该收藏分；不能超过那张牌本身的最高分。本实现自动选收益最大的那种。',
    basket: '【一扩】每持有 1 张螃蟹得 1 分（按你手牌+面前的螃蟹总数计）。本牌自身不是螃蟹，不会被自己加成。',
  };

  const KIND_LABEL = { duo: '成对牌', collector: '收藏牌', multiplier: '倍增牌', special: '特殊牌' };

  // ---------- 折纸风 SVG 卡面（100×100 viewBox） ----------
  const ART = {
    crab: '<polygon points="30,58 42,42 58,42 70,58 62,72 38,72" fill="#e0632f"/><polygon points="42,42 58,42 50,33" fill="#c94f22"/><polygon points="19,43 32,51 23,60" fill="#e0632f"/><polygon points="81,43 68,51 77,60" fill="#e0632f"/><polygon points="34,70 25,80 30,82 39,72" fill="#c94f22"/><polygon points="66,70 75,80 70,82 61,72" fill="#c94f22"/><circle cx="44" cy="51" r="2.6" fill="#2b2b2b"/><circle cx="56" cy="51" r="2.6" fill="#2b2b2b"/>',
    boat: '<polygon points="24,64 76,64 66,78 34,78" fill="#8a5a2b"/><polygon points="24,64 76,64 70,70 30,70" fill="#6f4620"/><rect x="51" y="27" width="2.5" height="38" fill="#5b3a1a"/><polygon points="55,30 55,60 78,60" fill="#fdf6e3"/><polygon points="49,38 49,60 30,60" fill="#eadbb5"/><polygon points="6,84 24,77 40,84 56,77 72,84 88,77 97,82 97,92 6,92" fill="#7fb5d6"/>',
    fish: '<polygon points="26,52 48,32 74,48 74,56 48,70" fill="#4a90b8"/><polygon points="74,44 93,31 93,67 74,58" fill="#3a78a0"/><polygon points="46,32 54,19 61,33" fill="#3a78a0"/><circle cx="38" cy="47" r="3" fill="#123047"/>',
    shark: '<polygon points="10,54 34,40 66,40 90,52 70,62 34,62" fill="#6b7f94"/><polygon points="44,40 52,21 61,40" fill="#5a6e82"/><polygon points="10,54 0,40 8,54 0,68" fill="#5a6e82"/><polygon points="38,61 80,55 66,66 42,66" fill="#eef2f5"/><polygon points="63,46 65,55 68,46" fill="#5a6e82"/><circle cx="75" cy="49" r="2.6" fill="#123047"/>',
    swimmer: '<polygon points="43,29 61,29 58,19 46,19" fill="#d94f3d"/><circle cx="52" cy="31" r="9" fill="#e8b88a"/><polygon points="37,49 50,40 55,46 42,55" fill="#e8b88a"/><polygon points="42,59 62,59 58,46 46,46" fill="#e8b88a"/><polygon points="6,64 24,57 40,64 58,57 74,64 90,57 98,62 98,92 6,92" fill="#7fb5d6"/><polygon points="6,75 30,69 52,75 74,69 94,75 98,73 98,92 6,92" fill="#5b9bd5"/>',
    mermaid: '<polygon points="40,20 60,20 64,36 36,36" fill="#7a4a2b"/><circle cx="50" cy="31" r="8" fill="#f0c8a0"/><polygon points="42,23 50,19 58,23 55,29 45,29" fill="#8a5635"/><polygon points="44,40 56,40 58,54 42,54" fill="#f0c8a0"/><polygon points="44,40 56,40 54,48 46,48" fill="#3aa6a0"/><polygon points="42,54 58,54 66,74 50,91 34,74" fill="#3aa6a0"/><polygon points="42,54 50,91 34,74" fill="#2e8d88"/><polygon points="66,74 79,84 61,88" fill="#2e8d88"/><polygon points="34,74 21,84 39,88" fill="#2e8d88"/>',
    shell: '<polygon points="50,84 26,44 36,36" fill="#e8a06a"/><polygon points="50,84 36,36 50,29" fill="#d4824f"/><polygon points="50,84 50,29 64,36" fill="#e8a06a"/><polygon points="50,84 64,36 74,44" fill="#d4824f"/><rect x="43" y="80" width="14" height="8" fill="#b06a3f"/>',
    octopus: '<polygon points="30,50 38,26 62,26 70,50 62,60 38,60" fill="#8c5aa8"/><path d="M36,60 Q28,72 20,70 Q27,79 37,72" fill="#7a4a94"/><path d="M46,62 Q44,76 33,80 Q46,83 51,70" fill="#7a4a94"/><path d="M56,62 Q60,76 71,80 Q58,83 53,70" fill="#7a4a94"/><path d="M66,60 Q74,72 83,68 Q76,79 63,72" fill="#7a4a94"/><circle cx="42" cy="46" r="3.2" fill="#fff"/><circle cx="58" cy="46" r="3.2" fill="#fff"/><circle cx="42" cy="46" r="1.6" fill="#222"/><circle cx="58" cy="46" r="1.6" fill="#222"/>',
    penguin: '<polygon points="36,26 64,26 70,76 30,76" fill="#26292e"/><polygon points="42,34 58,34 62,72 38,72" fill="#f4f1e8"/><polygon points="36,40 31,58 38,60" fill="#1a1d21"/><polygon points="64,40 69,58 62,60" fill="#1a1d21"/><polygon points="46,30 54,30 50,37" fill="#e8912d"/><circle cx="44" cy="29" r="2" fill="#fff"/><circle cx="56" cy="29" r="2" fill="#fff"/><polygon points="38,76 46,76 42,83" fill="#e8912d"/><polygon points="54,76 62,76 58,83" fill="#e8912d"/>',
    sailor: '<polygon points="34,36 66,36 60,24 40,24" fill="#f4f1e8"/><rect x="34" y="36" width="32" height="7" fill="#2c3e66"/><circle cx="50" cy="30" r="2.5" fill="#d4a017"/><circle cx="50" cy="49" r="10" fill="#e8b88a"/><polygon points="28,84 72,84 64,60 36,60" fill="#f4f1e8"/><polygon points="44,60 56,60 50,73" fill="#2c5aa8"/><polygon points="59,65 68,84 63,84 55,67" fill="#2c5aa8"/><polygon points="41,65 32,84 37,84 45,67" fill="#2c5aa8"/>',
    lighthouse: '<polygon points="42,80 58,80 56,38 44,38" fill="#f4f1e8"/><polygon points="43.4,50 56.6,50 56,42 44,42" fill="#d94f3d"/><polygon points="42.7,66 57.3,66 56.6,58 43.4,58" fill="#d94f3d"/><rect x="43" y="28" width="14" height="10" fill="#f2c94c"/><polygon points="40,28 60,28 50,15" fill="#d94f3d"/><polygon points="43,32 22,23 22,41" fill="#f7e08a"/><polygon points="57,32 78,23 78,41" fill="#f7e08a"/><polygon points="38,80 62,80 67,89 33,89" fill="#9aa0a6"/>',
    shoal: '<polygon points="22,34 36,26 48,34 36,42" fill="#4a90b8"/><polygon points="48,30 58,24 58,44 48,38" fill="#3a78a0"/><polygon points="46,52 60,44 72,52 60,60" fill="#5b9bd5"/><polygon points="46,48 36,42 36,62 46,56" fill="#47799e"/><polygon points="34,72 46,64 58,72 46,80" fill="#7fb5d6"/><polygon points="58,68 68,62 68,82 58,76" fill="#5b93b8"/><circle cx="30" cy="33" r="2" fill="#123047"/><circle cx="54" cy="51" r="2" fill="#123047"/><circle cx="42" cy="71" r="2" fill="#123047"/>',
    colony: '<polygon points="12,78 88,78 80,90 20,90" fill="#dfe9ee"/><polygon points="28,50 40,50 44,78 24,78" fill="#26292e"/><polygon points="31,54 37,54 40,74 28,74" fill="#f4f1e8"/><polygon points="31,50 37,50 34,55" fill="#e8912d"/><polygon points="42,44 58,44 63,78 37,78" fill="#26292e"/><polygon points="46,49 54,49 58,74 42,74" fill="#f4f1e8"/><polygon points="46,44 54,44 50,50" fill="#e8912d"/><polygon points="62,52 74,52 78,78 58,78" fill="#26292e"/><polygon points="65,56 71,56 74,74 62,74" fill="#f4f1e8"/><polygon points="65,52 71,52 68,57" fill="#e8912d"/>',
    captain: '<polygon points="32,30 68,30 64,20 36,20" fill="#22345c"/><rect x="30" y="30" width="40" height="6" fill="#16233f"/><circle cx="50" cy="25" r="2.5" fill="#d4a017"/><circle cx="50" cy="45" r="10" fill="#e8b88a"/><polygon points="41,48 59,48 56,64 44,64" fill="#c9cdd2"/><polygon points="26,85 74,85 68,58 32,58" fill="#2c3e66"/><rect x="30" y="58" width="10" height="4" fill="#d4a017"/><rect x="60" y="58" width="10" height="4" fill="#d4a017"/><circle cx="50" cy="67" r="1.7" fill="#d4a017"/><circle cx="50" cy="73" r="1.7" fill="#d4a017"/><circle cx="50" cy="79" r="1.7" fill="#d4a017"/>',
    /* —— 一扩卡面（依旧折纸风：多边形块面 + 同色深一档做阴面）—— */
    jellyfish: '<polygon points="26,52 34,30 50,23 66,30 74,52 62,58 38,58" fill="#d7bce8"/><polygon points="34,30 50,23 50,54 38,58" fill="#b78fd0"/><polygon points="50,23 66,30 62,58 50,54" fill="#c9a8e0"/><polygon points="30,58 25,74 32,89 37,70" fill="#a97fc4"/><polygon points="42,60 39,78 46,93 49,72" fill="#b78fd0"/><polygon points="58,60 61,78 54,93 51,72" fill="#b78fd0"/><polygon points="70,58 75,74 68,89 63,70" fill="#a97fc4"/><circle cx="43" cy="44" r="2.4" fill="#3a2b4a"/><circle cx="57" cy="44" r="2.4" fill="#3a2b4a"/>',
    lobster: '<polygon points="40,30 60,30 64,58 50,68 36,58" fill="#e0632f"/><polygon points="40,30 50,26 50,64 42,52" fill="#c94f22"/><polygon points="36,40 18,31 11,44 26,50 20,59 35,52" fill="#d94f3d"/><polygon points="64,40 82,31 89,44 74,50 80,59 65,52" fill="#d94f3d"/><polygon points="42,68 58,68 54,80 46,80" fill="#c94f22"/><polygon points="45,80 55,80 50,93" fill="#b83a2a"/><polygon points="44,28 41,17 47,26" fill="#b83a2a"/><polygon points="56,28 59,17 53,26" fill="#b83a2a"/><circle cx="45" cy="37" r="2.3" fill="#2b1a12"/><circle cx="55" cy="37" r="2.3" fill="#2b1a12"/>',
    starfish: '<polygon points="50,13 58,37 84,37 63,53 71,82 50,65 29,82 37,53 16,37 42,37" fill="#e9c449"/><polygon points="50,13 50,65 29,82 37,53 16,37 42,37" fill="#d4a92f"/><polygon points="50,25 54,37 50,49 46,37" fill="#f6e6a8"/><circle cx="50" cy="45" r="2.6" fill="#c9922f"/>',
    seahorse: '<polygon points="45,17 61,17 65,30 55,39 45,32" fill="#e8a06a"/><polygon points="61,19 72,14 64,27" fill="#d4824f"/><polygon points="45,32 57,40 50,55 39,48" fill="#e8a06a"/><polygon points="39,48 52,57 46,71 33,64" fill="#d4824f"/><polygon points="33,64 48,73 42,85 29,79" fill="#c9703f"/><polygon points="42,85 53,89 47,95 35,91" fill="#b06a3f"/><polygon points="57,45 72,43 63,57" fill="#f0c07a"/><circle cx="53" cy="26" r="2.2" fill="#3a2412"/>',
    basket: '<polygon points="34,50 40,33 60,33 66,50" fill="#e0632f"/><polygon points="34,43 25,37 29,48" fill="#c94f22"/><polygon points="66,43 75,37 71,48" fill="#c94f22"/><circle cx="44" cy="41" r="2.3" fill="#2b2b2b"/><circle cx="56" cy="41" r="2.3" fill="#2b2b2b"/><polygon points="17,50 83,50 74,88 26,88" fill="#a9743f"/><polygon points="17,50 83,50 81,59 19,59" fill="#8a5a2b"/><polygon points="31,62 35,85 40,85 36,62" fill="#8a5a2b"/><polygon points="56,62 60,85 65,85 61,62" fill="#8a5a2b"/><polygon points="26,88 74,88 72,93 28,93" fill="#6f4620"/>',
  };

  // ---------- 卡通贴纸风 SVG 卡面（19 种，与 ART 同键） ----------
  // 视觉语言：所有形状共用一套「深暖色粗描边（3.5、圆角接头）+ 平涂主色 + 最多一层暗部」，
  // 用 stk() 把每张牌包进同一个 <g> 继承描边；眼睛/瞳孔这类小点单独写 stroke="none"，免得被描边糊掉。
  // 动物牌给眼睛和嘴做表情，物体牌（灯塔/小船/贝壳/篮）走干净轮廓。
  const STK_EDGE = 'stroke="#33261a" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"';
  function stk(inner) { return '<g ' + STK_EDGE + '>' + inner + '</g>'; }
  const ART_STICKER = {
    crab: stk('<path d="M33,63 L19,69 M33,56 L17,57 M33,50 L20,44" fill="none"/><path d="M67,63 L81,69 M67,56 L83,57 M67,50 L80,44" fill="none"/><circle cx="21" cy="41" r="8.5" fill="#f08a3c"/><circle cx="79" cy="41" r="8.5" fill="#f08a3c"/><path d="M21,41 l7,-2.5 M21,41 l7,2.5" fill="none" stroke-width="2.4"/><path d="M79,41 l-7,-2.5 M79,41 l-7,2.5" fill="none" stroke-width="2.4"/><ellipse cx="50" cy="58" rx="22" ry="15" fill="#f08a3c"/><line x1="43" y1="45" x2="43" y2="50" stroke-width="2.6"/><line x1="57" y1="45" x2="57" y2="50" stroke-width="2.6"/><circle cx="43" cy="42" r="4.2" fill="#fff"/><circle cx="57" cy="42" r="4.2" fill="#fff"/><circle cx="43.6" cy="42" r="1.8" fill="#33261a" stroke="none"/><circle cx="57.6" cy="42" r="1.8" fill="#33261a" stroke="none"/><path d="M40,60 q10,7 20,0" fill="none" stroke-width="2.4"/>'),
    boat: stk('<path d="M22,66 L78,66 L68,80 L32,80 Z" fill="#c98a4b"/><line x1="50" y1="26" x2="50" y2="66" stroke-width="3"/><path d="M52,28 L52,62 L74,62 Z" fill="#fdf6e3"/><path d="M48,36 L48,62 L30,62 Z" fill="#f0e2bd"/><path d="M10,84 q10,-6 20,0 q10,6 20,0 q10,-6 20,0 q10,6 20,0" fill="none" stroke="#5b9bd5" stroke-width="3.5"/>'),
    fish: stk('<path d="M60,50 L82,36 L82,64 Z" fill="#3a78a0"/><ellipse cx="46" cy="50" rx="26" ry="16" fill="#4a90b8"/><path d="M40,34 Q46,22 54,34 Z" fill="#3a78a0"/><circle cx="34" cy="46" r="3" fill="#123047" stroke="none"/><path d="M24,55 q6,4 12,0" fill="none" stroke-width="2"/>'),
    shark: stk('<path d="M12,54 Q26,42 50,42 L70,44 Q86,48 90,54 Q80,60 60,60 L30,60 Q18,60 12,54 Z" fill="#6b7f94"/><path d="M46,42 L54,24 L62,42 Z" fill="#5a6e82"/><path d="M12,54 L2,42 L8,54 L2,66 Z" fill="#5a6e82"/><circle cx="74" cy="50" r="2.6" fill="#123047" stroke="none"/><path d="M62,56 q10,3 18,-1" fill="none" stroke-width="2"/>'),
    swimmer: stk('<circle cx="50" cy="34" r="11" fill="#e8b88a"/><path d="M39,32 Q40,20 50,20 Q60,20 61,32 Q55,27 50,27 Q45,27 39,32 Z" fill="#d94f3d"/><circle cx="46" cy="35" r="1.4" fill="#33261a" stroke="none"/><circle cx="54" cy="35" r="1.4" fill="#33261a" stroke="none"/><path d="M47,39 q3,2 6,0" fill="none" stroke-width="1.6"/><path d="M28,58 Q40,50 50,54 Q60,50 72,58" fill="none" stroke-width="3"/><path d="M8,68 q10,-6 20,0 q10,6 20,0 q10,-6 20,0 q10,6 20,0" fill="none" stroke="#5b9bd5" stroke-width="3.5"/><path d="M8,82 q10,-6 20,0 q10,6 20,0 q10,-6 20,0 q10,6 20,0" fill="none" stroke="#7fb5d6" stroke-width="3.5"/>'),
    mermaid: stk('<path d="M42,25 q-5,13 -2,23 q4,-12 4,-23 z" fill="#8a5635"/><path d="M58,25 q5,13 2,23 q-4,-12 -4,-23 z" fill="#8a5635"/><path d="M44,36 C42,54 46,68 50,78 C54,68 58,54 56,36 Z" fill="#3fb0a8"/><path d="M50,76 q-14,2 -18,14 q11,-5 18,-8 q7,3 18,8 q-4,-12 -18,-14 z" fill="#2e8d88"/><path d="M45,39 C39,41 33,45 30,51 C34,53 40,49 46,45 Z" fill="#f6c99a"/><path d="M55,39 C61,41 67,45 70,51 C66,53 60,49 54,45 Z" fill="#f6c99a"/><circle cx="50" cy="24" r="11.5" fill="#8a5635"/><circle cx="50" cy="28" r="9" fill="#f6c99a"/><circle cx="46.8" cy="28" r="1.3" fill="#33261a" stroke="none"/><circle cx="53.2" cy="28" r="1.3" fill="#33261a" stroke="none"/><path d="M47,32 q3,2 6,0" fill="none" stroke-width="1.6"/>'),
    shell: stk('<path d="M50,84 L22,44 Q50,26 78,44 Z" fill="#e8a06a"/><path d="M50,84 L36,40 M50,84 L50,32 M50,84 L64,40" fill="none" stroke-width="2.4"/><path d="M42,84 L58,84 L56,92 L44,92 Z" fill="#b06a3f"/>'),
    octopus: stk('<path d="M30,52 Q28,26 50,26 Q72,26 70,52 Q70,60 62,62 L38,62 Q30,60 30,52 Z" fill="#8c5aa8"/><path d="M36,62 q-6,14 -16,16 M44,63 q-2,16 -8,22 M56,63 q2,16 8,22 M64,62 q6,14 16,16" fill="none" stroke-width="4"/><circle cx="42" cy="46" r="4.5" fill="#fff" stroke-width="2.5"/><circle cx="58" cy="46" r="4.5" fill="#fff" stroke-width="2.5"/><circle cx="42" cy="47" r="2" fill="#33261a" stroke="none"/><circle cx="58" cy="47" r="2" fill="#33261a" stroke="none"/>'),
    penguin: stk('<path d="M50,20 Q32,20 32,48 L32,74 Q32,84 50,84 Q68,84 68,74 L68,48 Q68,20 50,20 Z" fill="#2b2f36"/><ellipse cx="50" cy="60" rx="13" ry="20" fill="#f4f1e8"/><circle cx="44" cy="38" r="3.5" fill="#fff" stroke="none"/><circle cx="56" cy="38" r="3.5" fill="#fff" stroke="none"/><circle cx="44" cy="38" r="1.6" fill="#33261a" stroke="none"/><circle cx="56" cy="38" r="1.6" fill="#33261a" stroke="none"/><path d="M46,44 L54,44 L50,50 Z" fill="#e8912d"/><path d="M32,52 q-8,8 -4,18" fill="none" stroke-width="4"/><path d="M68,52 q8,8 4,18" fill="none" stroke-width="4"/><path d="M40,84 l-6,7 l12,0 z" fill="#e8912d"/><path d="M60,84 l-6,7 l12,0 z" fill="#e8912d"/>'),
    sailor: stk('<circle cx="50" cy="36" r="11" fill="#e8b88a"/><path d="M38,33 Q38,22 50,22 Q62,22 62,33 Z" fill="#f4f1e8"/><rect x="35" y="31" width="30" height="5" rx="2" fill="#2c3e66"/><circle cx="46" cy="38" r="1.4" fill="#33261a" stroke="none"/><circle cx="54" cy="38" r="1.4" fill="#33261a" stroke="none"/><path d="M47,42 q3,2 6,0" fill="none" stroke-width="1.6"/><path d="M32,86 L36,56 Q50,50 64,56 L68,86 Z" fill="#f4f1e8"/><path d="M44,55 L50,65 L56,55" fill="none" stroke-width="3"/><path d="M34,70 L66,70 M34,78 L66,78" fill="none" stroke="#2c5aa8" stroke-width="3"/>'),
    lighthouse: stk('<path d="M42,30 L12,21 L12,39 Z" fill="#ffe08a"/><path d="M58,30 L88,21 L88,39 Z" fill="#ffe08a"/><path d="M42,35 L58,35 L62,80 L38,80 Z" fill="#f6ecd6"/><path d="M41,47 L59,47 L60,57 L40,57 Z" fill="#e8503a"/><path d="M39,66 L61,66 L62,76 L38,76 Z" fill="#e8503a"/><rect x="41" y="24" width="18" height="12" rx="1.5" fill="#ffd45e"/><line x1="50" y1="24" x2="50" y2="36" stroke-width="2"/><path d="M39,24 L61,24 L50,12 Z" fill="#e8503a"/><path d="M33,80 L67,80 L72,91 L28,91 Z" fill="#b9b2a4"/>'),
    shoal: stk('<path d="M48,34 L58,27 L58,41 Z" fill="#3a78a0"/><ellipse cx="34" cy="34" rx="13" ry="8" fill="#4a90b8"/><circle cx="28" cy="32" r="1.8" fill="#123047" stroke="none"/><path d="M72,52 L82,45 L82,59 Z" fill="#3a78a0"/><ellipse cx="58" cy="52" rx="13" ry="8" fill="#5b9bd5"/><circle cx="52" cy="50" r="1.8" fill="#123047" stroke="none"/><path d="M54,72 L64,65 L64,79 Z" fill="#3a78a0"/><ellipse cx="40" cy="72" rx="13" ry="8" fill="#7fb5d6"/><circle cx="34" cy="70" r="1.8" fill="#123047" stroke="none"/>'),
    colony: stk('<path d="M14,82 L86,82 L80,92 L20,92 Z" fill="#dfe9ee"/><ellipse cx="32" cy="66" rx="10" ry="15" fill="#2b2f36"/><ellipse cx="32" cy="69" rx="5.5" ry="10" fill="#f4f1e8"/><circle cx="30" cy="58" r="1.3" fill="#fff" stroke="none"/><circle cx="34" cy="58" r="1.3" fill="#fff" stroke="none"/><path d="M30,62 L34,62 L32,65 Z" fill="#e8912d"/><ellipse cx="68" cy="66" rx="10" ry="15" fill="#2b2f36"/><ellipse cx="68" cy="69" rx="5.5" ry="10" fill="#f4f1e8"/><circle cx="66" cy="58" r="1.3" fill="#fff" stroke="none"/><circle cx="70" cy="58" r="1.3" fill="#fff" stroke="none"/><path d="M66,62 L70,62 L68,65 Z" fill="#e8912d"/><ellipse cx="50" cy="58" rx="11" ry="17" fill="#2b2f36"/><ellipse cx="50" cy="61" rx="6" ry="11" fill="#f4f1e8"/><circle cx="47" cy="49" r="1.4" fill="#fff" stroke="none"/><circle cx="53" cy="49" r="1.4" fill="#fff" stroke="none"/><path d="M47,53 L53,53 L50,57 Z" fill="#e8912d"/>'),
    captain: stk('<circle cx="50" cy="40" r="11" fill="#e8b88a"/><path d="M37,33 L63,33 L61,25 L39,25 Z" fill="#22345c"/><path d="M39,25 Q50,17 61,25 Z" fill="#22345c"/><rect x="35" y="32" width="30" height="5" rx="2" fill="#16233f"/><circle cx="50" cy="24" r="2.5" fill="#d4a017" stroke="none"/><circle cx="46" cy="41" r="1.4" fill="#33261a" stroke="none"/><circle cx="54" cy="41" r="1.4" fill="#33261a" stroke="none"/><path d="M47,45 q3,2 6,0" fill="none" stroke-width="1.6"/><path d="M30,86 L36,58 Q50,52 64,58 L70,86 Z" fill="#2c3e66"/><circle cx="50" cy="66" r="1.8" fill="#d4a017" stroke="none"/><circle cx="50" cy="74" r="1.8" fill="#d4a017" stroke="none"/><circle cx="50" cy="82" r="1.8" fill="#d4a017" stroke="none"/><path d="M36,60 L45,60 M55,60 L64,60" fill="none" stroke="#d4a017" stroke-width="3"/>'),
    jellyfish: stk('<path d="M28,50 Q28,26 50,26 Q72,26 72,50 Q60,56 50,52 Q40,56 28,50 Z" fill="#d7bce8"/><path d="M36,54 q-4,16 2,28 M46,56 q-2,18 -6,30 M56,56 q2,18 6,30 M64,54 q4,16 -2,28" fill="none" stroke="#a97fc4" stroke-width="3.5"/><circle cx="43" cy="42" r="2.4" fill="#3a2b4a" stroke="none"/><circle cx="57" cy="42" r="2.4" fill="#3a2b4a" stroke="none"/>'),
    lobster: stk('<path d="M50,28 Q40,28 40,46 L42,64 Q50,70 58,64 L60,46 Q60,28 50,28 Z" fill="#e0632f"/><circle cx="28" cy="40" r="9" fill="#d94f3d"/><circle cx="72" cy="40" r="9" fill="#d94f3d"/><path d="M28,40 l8,-3 M28,40 l8,4" fill="none" stroke-width="2.4"/><path d="M72,40 l-8,-3 M72,40 l-8,4" fill="none" stroke-width="2.4"/><path d="M44,68 L56,68 L50,80 Z" fill="#c94f22"/><path d="M42,80 L58,80 L50,92 Z" fill="#b83a2a"/><path d="M46,26 q-3,-11 -11,-15 M54,26 q3,-11 11,-15" fill="none" stroke-width="2.4"/><circle cx="46" cy="36" r="1.8" fill="#33261a" stroke="none"/><circle cx="54" cy="36" r="1.8" fill="#33261a" stroke="none"/>'),
    starfish: stk('<path d="M50,16 L58,40 L84,40 L63,55 L71,82 L50,66 L29,82 L37,55 L16,40 L42,40 Z" fill="#e9c449"/><circle cx="50" cy="46" r="2.6" fill="#c9922f" stroke="none"/><circle cx="42" cy="40" r="1.4" fill="#d4a92f" stroke="none"/><circle cx="58" cy="40" r="1.4" fill="#d4a92f" stroke="none"/><circle cx="50" cy="58" r="1.4" fill="#d4a92f" stroke="none"/>'),
    seahorse: stk('<path d="M54,26 C40,30 46,44 40,54 C34,64 44,72 40,84" fill="none" stroke="#33261a" stroke-width="13" stroke-linecap="round"/><path d="M54,26 C40,30 46,44 40,54 C34,64 44,72 40,84" fill="none" stroke="#e8a06a" stroke-width="8" stroke-linecap="round"/><circle cx="56" cy="24" r="8" fill="#e8a06a"/><path d="M63,22 L76,20 L76,26 Z" fill="#d4824f"/><path d="M40,48 q-11,1 -13,10 q9,-2 14,-3 z" fill="#f0c07a"/><path d="M40,84 q10,4 6,12" fill="none" stroke-width="4"/><circle cx="57" cy="22" r="1.8" fill="#33261a" stroke="none"/>'),
    basket: stk('<path d="M30,52 Q50,28 70,52" fill="none" stroke-width="3"/><ellipse cx="50" cy="44" rx="13" ry="9" fill="#f08a3c"/><circle cx="37" cy="39" r="4.5" fill="#f08a3c"/><circle cx="63" cy="39" r="4.5" fill="#f08a3c"/><line x1="46" y1="34" x2="46" y2="40" stroke-width="2"/><line x1="54" y1="34" x2="54" y2="40" stroke-width="2"/><circle cx="46" cy="33" r="1.8" fill="#fff" stroke="none"/><circle cx="54" cy="33" r="1.8" fill="#fff" stroke="none"/><path d="M24,50 L76,50 L74,60 L26,60 Z" fill="#a9743f"/><path d="M28,60 L72,60 L66,88 L34,88 Z" fill="#c98a4b"/><path d="M38,62 L42,86 M50,62 L50,86 M62,62 L58,86" fill="none" stroke="#8a5a2b" stroke-width="2.5"/>'),
  };

  // ---------- 皮肤（卡面美术方案）----------
  // 两套图共用同样的 19 个键，渲染时按玩家选的皮肤取图。
  // 皮肤选择持久化在 localStorage：牌表页（独立页面，无对局状态）与对局页共享同一个选择。
  const SKIN_KEY = 'ssp-skin';
  const ARTS = { origami: ART, sticker: ART_STICKER };
  function getSavedSkin() {
    try {
      return (global.localStorage && global.localStorage.getItem(SKIN_KEY) === 'sticker') ? 'sticker' : 'origami';
    } catch (e) { return 'origami'; } // 无 localStorage 环境（node 自测）固定折纸
  }
  function setSavedSkin(skin) {
    try { if (global.localStorage) global.localStorage.setItem(SKIN_KEY, skin); } catch (e) { /* 存不上也不影响本局 */ }
  }
  let skin = getSavedSkin();
  // 取当前皮肤对应的一套牌面 SVG（键 = 牌型）
  function currentArt() { return ARTS[skin] || ART; }
  // 切皮肤：记住选择并重绘；若停在开始页则连开始页一起刷新（预览图跟着变）
  function setSkin(next) {
    skin = ARTS[next] ? next : 'origami';
    setSavedSkin(skin);
    const S = global.SPGame && global.SPGame.state;
    if (S) render(S);
    const startEl = $('start-page');
    if (startEl && !startEl.classList.contains('hidden')) renderStartPage();
  }

  const BACK_SVG = '<rect x="0" y="0" width="100" height="140" fill="#2c5a8c"/><path d="M0,30 Q12,22 25,30 T50,30 T75,30 T100,30" stroke="#4a7cae" stroke-width="3" fill="none"/><path d="M0,55 Q12,47 25,55 T50,55 T75,55 T100,55" stroke="#4a7cae" stroke-width="3" fill="none"/><path d="M0,80 Q12,72 25,80 T50,80 T75,80 T100,80" stroke="#4a7cae" stroke-width="3" fill="none"/><path d="M0,105 Q12,97 25,105 T50,105 T75,105 T100,105" stroke="#4a7cae" stroke-width="3" fill="none"/><polygon points="50,52 62,70 50,88 38,70" fill="#f2efe6"/><circle cx="50" cy="70" r="5" fill="#2c5a8c"/>';

  // ---------- 卡牌 DOM ----------
  // 入场动画去重：仅首次出现的牌播动画，避免全量重绘时整桌牌反复闪烁
  const seenCardIds = new Set();
  function hexRgb(hex) {
    const h = hex.replace('#', '');
    return [parseInt(h.substr(0, 2), 16), parseInt(h.substr(2, 2), 16), parseInt(h.substr(4, 2), 16)];
  }
  // 用整张牌背景色表达颜色：同色深浅渐变底 + 同色描边
  function cardBgStyle(hex) {
    const rgb = hexRgb(hex).join(',');
    return 'background:linear-gradient(160deg,rgba(' + rgb + ',.30) 0%,rgba(' + rgb + ',.52) 100%);border-color:rgba(' + rgb + ',.85);';
  }

  // ---------- 颜色识别图标 ----------
  // 实体牌上每种颜色除了底色还有一个小图形，给“底色看不准”时用作识别。
  // 图形形状以 11 色两两能分辨为先（照片里原始字形太小，做不到像素级复刻）。
  // 路径统一用 currentColor，墨色由 colorIconHTML 根据底色亮度选白/黑。
  const COLOR_ICON = {
    darkblue: '<path d="M6 3h12v18l-6-4.6L6 21z"/>',                                    // 书签（下边开口）
    teal:     '<path d="M20 4A16 16 0 0 1 4 20A16 16 0 0 1 20 4z"/>',                    // 叶片
    black:    '<rect x="4" y="4" width="16" height="16" rx="3"/>',                       // 实心方块
    yellow:   '<rect x="10" y="2.5" width="4" height="19" rx="2" transform="rotate(45 12 12)"/>', // 斜杠
    green:    '<rect x="4" y="4" width="16" height="16" rx="3" fill="none" stroke-width="2.6"/><path d="M7.5 16.5 16.5 7.5" stroke-width="2.4"/>', // 框+斜线
    white:    '<rect x="4" y="4" width="16" height="16" rx="3" fill="none" stroke-width="3"/>',   // 空心框
    purple:   '<path d="M4 20V4h15A16 16 0 0 1 4 20z"/>',                                // 四分之一圆
    gray:     '<rect x="4" y="4" width="16" height="16" rx="3" fill="none" stroke-width="2.2"/><rect x="9.5" y="9.5" width="5" height="5" rx="1"/>', // 框+中心点
    tan:      '<circle cx="12" cy="12" r="7.5"/>',                                       // 实心圆
    pink:     '<path d="M12 4l8 15H4z"/>',                                               // 实心三角
    orange:   '<rect x="2.5" y="10" width="3.4" height="14" rx="1.7" transform="rotate(28 12 12)"/><rect x="10.3" y="10" width="3.4" height="14" rx="1.7" transform="rotate(28 12 12)"/><rect x="18.1" y="10" width="3.4" height="14" rx="1.7" transform="rotate(28 12 12)"/>', // 三条斜杠
  };

  // 底色太亮时图形改用深色（白/黄/粉/棕褐等）
  function iconInk(hex) {
    const rgb = hexRgb(hex);
    return (0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]) > 150 ? 'rgba(0,0,0,.55)' : '#fff';
  }

  function colorIconHTML(color, extraCls) {
    const col = COLORS[color] || { name: '?', hex: '#999999' };
    const glyph = COLOR_ICON[color];
    return '<span class="color-icon' + (extraCls ? ' ' + extraCls : '') + '" title="' + col.name + '" ' +
      'style="background:' + col.hex + ';color:' + iconInk(col.hex) + '">' +
      (glyph ? '<svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-linejoin="round">' + glyph + '</svg>' : '') +
      '</span>';
  }

  // 11 色的图标图例（规则书「颜色奖励」一节用）
  function colorLegendHTML() {
    return '<div class="color-legend">' + Object.keys(COLORS).map(function (k) {
      return '<span>' + colorIconHTML(k, 'ci-inline') + COLORS[k].name + '</span>';
    }).join('') + '</div>';
  }

  function cardEl(c, size, faceUp, extraCls, pairOf) {
    const div = document.createElement('div');
    if (!faceUp) {
      div.className = 'card size-' + size + ' back ' + (extraCls || '');
      div.innerHTML = '<svg viewBox="0 0 100 140" preserveAspectRatio="none">' + BACK_SVG + '</svg>';
      return div;
    }
    const isNew = c.id != null && !seenCardIds.has(c.id);
    if (c.id != null) seenCardIds.add(c.id);
    const t = CARD_TYPES[c.type] || { name: '?', count: '' };
    const col = COLORS[c.color] || { name: '?', hex: '#999999' };
    div.className = 'card size-' + size + (extraCls ? ' ' + extraCls : '') + (pairOf ? ' in-pair' : '') +
      (isNew ? ' card-new' : '') + (t.exp ? ' is-exp' : '');
    div.style.cssText = cardBgStyle(col.hex);
    div.title = cardTitle(c);
    div.innerHTML =
      '<svg class="card-art" viewBox="0 0 100 100">' + (currentArt()[c.type] || '') + '</svg>' +
      '<div class="card-name">' + t.name + '</div>' +
      '<div class="card-corner">' + colorIconHTML(c.color) +
      (t.exp ? '<div class="exp-corner">扩</div>' : '') + '</div>' +
      '<div class="card-count">×' + t.count + '</div>';
    if (c.id != null) div.dataset.cardId = c.id;
    return div;
  }

  // 牌名（颜色）【一扩】 + 一行效果；title 与弹层共用
  function cardTitle(c) {
    const t = CARD_TYPES[c.type] || { name: '?', count: '' }, col = COLORS[c.color] || { name: '?', hex: '#999' };
    return t.name + '（' + col.name + '）' + (t.exp ? '【一扩】' : '') + '\n' + (EFFECT_TEXT[c.type] || '');
  }

  function cardHTML(c, size) {
    const t = CARD_TYPES[c.type] || { name: '?', count: '' }, col = COLORS[c.color] || { name: '?', hex: '#999999' };
    return '<div class="card size-' + size + (t.exp ? ' is-exp' : '') + '" data-card-id="' + c.id + '" style="' + cardBgStyle(col.hex) + '" title="' + cardTitle(c).replace('\n', '：') + '">' +
      '<svg class="card-art" viewBox="0 0 100 100">' + (currentArt()[c.type] || '') + '</svg>' +
      '<div class="card-name">' + t.name + '</div>' +
      '<div class="card-corner">' + colorIconHTML(c.color) +
      (t.exp ? '<div class="exp-corner">扩</div>' : '') + '</div>' +
      '<div class="card-count">×' + t.count + '</div></div>';
  }

  // ---------- 点牌弹说明 ----------
  // infoMode：开启后点任意牌只看说明、不执行动作（避开“点牌=选牌”的冲突）；
  // 未开启时，点了没有动作可做的牌（面前的牌、AI 的牌、不能拿的弃牌堆顶等）也直接弹说明。
  let infoMode = false;

  function holderLine(c) {
    const S = global.SPGame.state;
    if (!S) return '';
    const cnt = function (arr) { return arr.filter(function (x) { return x.type === c.type; }).length; };
    return '你手里 ' + cnt(S.players[0].hand) + ' 张 · 你面前 ' + cnt(S.players[0].table) +
      ' 张 · AI 面前 ' + cnt(S.players[1].table) + ' 张';
  }

  function cardInfoHTML(c) {
    const t = CARD_TYPES[c.type], col = COLORS[c.color];
    if (!t || !col) return '<h3>未知的牌</h3>';
    let h = '<h3>' + t.name + '（' + col.name + '）' + (t.exp ? ' <span class="exp-tag">一扩</span>' : '') + '</h3>';
    h += '<div class="row">' + cardHTML(c, 'hand') + '</div>';
    h += '<table class="help-tb kv">';
    h += '<tr><td>类别</td><td>' + (KIND_LABEL[t.kind] || t.kind) + '</td></tr>';
    h += '<tr><td>牌库张数</td><td>' + t.count + ' 张</td></tr>';
    h += '<tr><td>颜色</td><td>' + colorIconHTML(c.color, 'ci-inline') + col.name + '</td></tr>';
    h += '<tr><td>效果与得分</td><td>' + (EFFECT_LONG[c.type] || '—') + '</td></tr>';
    if (t.kind === 'collector' && global.SPCards.COLLECTOR_SCORES[c.type]) {
      h += '<tr><td>得分表</td><td>' + global.SPCards.COLLECTOR_SCORES[c.type].join(' / ') + '（1 张起到 ' + t.count + ' 张）</td></tr>';
    }
    h += '</table>';
    h += '<p class="hint">当前：' + holderLine(c) + '</p>';
    return h;
  }

  function showCardInfo(id) {
    const c = global.SPCards.cardById(id);
    if (!c) return;
    showPanel(cardInfoHTML(c));
  }

  // 两步拿牌（仅用于弃牌堆顶：拿的是那张具体的牌）：点牌后就地浮出「功能简介 + 拿取」，再点牌=取消
  function takePopoverHTML(card, pileIdx) {
    const text = cardTitle(card).replace('\n', '：');
    return '<div class="take-popover"><div class="tp-text">' + text + '</div>' +
      '<button class="btn primary mini" data-action="confirmTake" data-kind="discard" data-pile="' + pileIdx + '">拿取</button></div>';
  }

  // ---------- 渲染 ----------
  const $ = function (id) { return document.getElementById(id); };

  // 成对阶段的点选状态（仅 UI 层：选中两张合法成对并经「确认打出」后才提交动作）
  let selection = [];
  // 两步拿牌：当前预览中的可拿弃牌堆（{ pile }），null 表示无
  let takePreview = null;
  // 抽牌后「选留 1 张」弹层：当前预览中的候选牌 id，null 表示无
  let keepPreviewId = null;
  // 「自动配对」被螃蟹覆盖层打断后的续跑标记
  let pendingAutoSuggest = false;
  // 回合横幅：上一次弹过的行动方（-1 表示还没开过局，首次进入也会弹）、自动消失计时器
  let lastTurnCurrent = -1;
  let bannerTimer = null;
  // 人类回合两个到期自动处理的计时器（成对无牌可打 / 弃牌只剩一个合法堆）
  let autoSkipTimer = null;
  let autoDiscardTimer = null;

  function clearSelection() { selection = []; }

  // 悔棋：除引擎回退外，还要清掉只存在于 UI 层的临时状态（点选、自动配对续跑）
  function doUndo() {
    if (!global.SPGame.undo()) return;
    selection = [];
    takePreview = null;
    keepPreviewId = null;
    pendingAutoSuggest = false;
    if (autoResumeTimer) { clearTimeout(autoResumeTimer); autoResumeTimer = null; }
  }

  // 弹层里的「悔棋」按钮（无可撤回时置禁）
  function undoBtnHTML() {
    return '<button class="btn ghost" data-action="undo"' +
      (global.SPGame.canUndo() ? '' : ' disabled') + '>↶ 悔棋</button>';
  }

  function toggleSelect(id) {
    const i = selection.indexOf(id);
    if (i >= 0) { selection.splice(i, 1); return; }
    selection.push(id); // 上限由 selectHandCard 里的 selectionPromising 归一化控制（最多 3 张）
  }

  // ---------- 回合提示与「到期自动处理」 ----------
  // 横幅元素懒创建并挂在 #app 上：不用改 index.html，且弹层（#overlay）关掉后仍能复用
  function turnBannerEl() {
    const app = $('app');
    if (!app) return null;
    let banner = $('turn-banner');
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'turn-banner';
      app.appendChild(banner);
    }
    return banner;
  }

  function showTurnBanner(text) {
    const banner = turnBannerEl();
    if (!banner) return;
    banner.textContent = text;
    banner.className = text.indexOf('电脑') === 0 ? 'ai' : '';
    if (bannerTimer) clearTimeout(bannerTimer);
    bannerTimer = setTimeout(hideTurnBanner, 1600);
  }

  function hideTurnBanner() {
    const banner = $('turn-banner');
    if (banner) banner.className = 'hidden';
    if (bannerTimer) { clearTimeout(bannerTimer); bannerTimer = null; }
  }

  // 成对阶段到期自动往下走：此刻已没有对子/三人组可打才真的结束回合（有得打或玩家正在点选就不插手）
  function autoSkipDuos() {
    autoSkipTimer = null;
    const S = global.SPGame.state;
    if (!S || S.current !== 0 || S.phase !== 'duo') return;
    if (selection.length) return;
    const my = S.players[0];
    if (R.duoPairsInHand(my.hand).length || R.trioCombosInHand(my.hand).length) return;
    global.SPGame.skipDuos();
  }

  // 弃牌阶段到期自动弃：规则上只有一个合法弃牌堆（另一堆为空时必须弃进空堆）时不再让玩家选
  function autoDiscardOnlyTarget() {
    autoDiscardTimer = null;
    const S = global.SPGame.state;
    if (!S || S.current !== 0 || S.phase !== 'discard') return;
    const targets = R.discardTargets(S);
    const only = targets[0] && !targets[1] ? 0 : (targets[1] && !targets[0] ? 1 : -1);
    if (only < 0) return; // 两堆都合法：仍要玩家自己选
    global.SPGame.discardTo(only);
  }

  function clearAutoTimers() {
    if (autoSkipTimer) { clearTimeout(autoSkipTimer); autoSkipTimer = null; }
    if (autoDiscardTimer) { clearTimeout(autoDiscardTimer); autoDiscardTimer = null; }
  }

  function render(S) {
    // 换人回合：清掉上一回合可能残留的自动计时器与没看完的横幅
    if (S && S.current !== lastTurnCurrent) {
      clearAutoTimers();
      hideTurnBanner();
    }
    // 状态校验：选中的牌必须仍在手牌且处于人类成对阶段，失效则清空（防偷牌/换阶段后残留）
    if (S && S.current === 0 && S.phase === 'duo' && S.players[0].hand.length) {
      const handIds = new Set(S.players[0].hand.map(function (c) { return c.id; }));
      selection = selection.filter(function (id) { return handIds.has(id); });
    } else {
      selection = [];
    }
    if (!S) return;
    // 拿牌预览态失效自动清除：不在人类摸牌阶段 / 目标弃牌堆已空
    if (takePreview) {
      if (!(S.current === 0 && S.phase === 'draw')) takePreview = null;
      else if (takePreview.kind === 'discard') {
        const p = S.discards[takePreview.pile];
        if (!p || !p.length) takePreview = null;
      }
    }
    // 选牌弹层预览态：不在 keep 阶段就清除
    if (keepPreviewId != null && !(S.current === 0 && S.phase === 'keep')) keepPreviewId = null;
    // 回合归属横幅：只在真的换人行动时弹一下（1.6 秒自动消失）
    if (S.current !== lastTurnCurrent) {
      lastTurnCurrent = S.current;
      showTurnBanner(S.current === 0 ? '你的回合' : '电脑回合');
    }
    // 人类回合的两个「到期自动处理」：没对子可打→1 秒后结束成对阶段；弃牌只有一个合法堆→0.6 秒后自动弃
    if (S.current === 0 && S.phase === 'duo' && !autoSkipTimer) {
      autoSkipTimer = setTimeout(autoSkipDuos, 1000);
    }
    if (S.current === 0 && S.phase === 'discard' && !autoDiscardTimer) {
      autoDiscardTimer = setTimeout(autoDiscardOnlyTarget, 600);
    }
    // 悔棋圆钮的可用态
    const undoBtn = $('undo-btn');
    if (undoBtn) {
      const canUndo = global.SPGame.canUndo();
      undoBtn.disabled = !canUndo;
      undoBtn.title = canUndo ? '悔棋：撤回本回合的上一步操作' : '悔棋：只能撤销本回合内的操作';
    }
    const my = S.players[0], ai = S.players[1];
    const myScore = R.scoreHand(my);
    const aiTableScore = R.scoreHand({ hand: [], table: ai.table });

    // 顶部 AI 区
    $('ai-total').textContent = ai.total;
    $('ai-table-score').textContent = aiTableScore;
    $('ai-hand-count').textContent = ai.hand.length;
    const aiHand = $('ai-hand');
    aiHand.innerHTML = '';
    for (const c of ai.hand) aiHand.appendChild(cardEl(c, 'mini', S.revealAI));
    const aiTable = $('ai-table');
    aiTable.innerHTML = '';
    for (const c of ai.table) aiTable.appendChild(cardEl(c, 'table', true));

    // 中部牌库与弃牌堆
    $('deck-count').textContent = S.deck.length + ' 张';
    const deckEl = $('deck');
    deckEl.innerHTML = '';
    const legal = R.legalDraw(S);
    if (legal.canDeck && S.current === 0 && S.phase === 'draw') {
      const btn = cardEl(null, 'pile', false, 'clickable');
      btn.dataset.action = 'drawFromDeck';
      deckEl.appendChild(btn);
    } else {
      deckEl.appendChild(cardEl(null, 'pile', false));
    }
    for (let i = 0; i < 2; i++) {
      const el = $('discard-' + i);
      el.innerHTML = '';
      const pile = S.discards[i];
      const canTake = S.current === 0 && S.phase === 'draw' && pile.length > 0;
      if (pile.length) {
        const top = pile[pile.length - 1];
        const e = cardEl(top, 'pile', true, canTake ? 'clickable takeable' : '');
        if (canTake) { e.dataset.action = 'previewTake'; e.dataset.kind = 'discard'; e.dataset.pile = i; }
        const previewing = canTake && takePreview && takePreview.kind === 'discard' && takePreview.pile === i;
        if (previewing) e.classList.add('selected');
        el.appendChild(e);
        const n = document.createElement('div');
        n.className = 'pile-n'; n.textContent = pile.length > 1 ? pile.length : '';
        el.appendChild(n);
        if (previewing) el.insertAdjacentHTML('beforeend', takePopoverHTML(top, i));
      } else {
        const e = document.createElement('div');
        e.className = 'pile empty-slot' + (canTake ? '' : '');
        e.textContent = '空';
        el.appendChild(e);
      }
    }

    // 阶段提示
    $('phase-bar').textContent = (infoMode ? '【说明模式】点牌只看说明· ' : '') + phaseText(S);

    // 成对按钮条
    const duoBar = $('duo-bar');
    duoBar.innerHTML = '';
    if (S.current === 0 && S.phase === 'duo') {
      const pairs = R.duoPairsInHand(my.hand);
      const trios = R.trioCombosInHand(my.hand);
      const inFinal = S.lastChance && S.current !== S.lastChance.caller;
      const auto = document.createElement('button');
      auto.className = 'btn duo-btn';
      auto.dataset.action = 'autoSuggestPairs';
      /* 长/短两套文案：手机上括号说明换成 ×N（否则按钮一行放不下，整条被顶成三行） */
      auto.innerHTML = pairs.length
        ? '自动配对<span class="bt-long">（一次打出全部 ' + pairs.length + ' 对）</span><span class="bt-short"> ×' + pairs.length + '</span>'
        : '自动配对';
      if (!pairs.length) auto.classList.add('disabled');
      auto.title = trios.length ? '自动配对只打此刻手里的对子，不会用海星组三人组（有 ' + trios.length + ' 组可点选手动打出）' : '一键打出手里全部成对（效果新抽入的牌不自动打）';
      duoBar.appendChild(auto);
      const skip = document.createElement('button');
      skip.className = 'btn ghost';
      skip.dataset.action = 'skipDuos';
      skip.textContent = inFinal ? '结束最终回合' : '结束回合';
      duoBar.appendChild(skip);

      // 点选确认条：已选牌（2 张=成对，3 张=海星三人组）+ 确认打出/取消
      // 文案必须插到按钮前面：手机上它独占一行，放在中间会把按钮拆成两批（三行 = 94px 高）
      if (selection.length) {
        const info = document.createElement('span');
        info.className = 'sel-info';
        const names = selection.map(function (id) {
          const c = my.hand.find(function (x) { return x.id === id; });
          return c ? CARD_TYPES[c.type].name : '?';
        });
        const hasStar = selection.some(function (id) {
          const c = my.hand.find(function (x) { return x.id === id; });
          return c && c.type === 'starfish';
        });
        if (selection.length === 3 && R.isValidTrio(my.hand, selection)) {
          info.textContent = '已选三人组：' + names.join(' + ') + '（共 3 分，取消该对效果）';
          duoBar.insertBefore(info, duoBar.firstChild);
          duoBar.appendChild(mkBtn('确认打出', 'confirmPair', 'btn primary mini'));
          duoBar.appendChild(mkBtn('取消', 'clearSel', 'btn ghost mini'));
        } else if (selection.length === 2 && R.isValidPair(my.hand, selection)) {
          info.textContent = '已选：' + names.join(' + ') + '（合法成对）';
          duoBar.insertBefore(info, duoBar.firstChild);
          duoBar.appendChild(mkBtn('确认打出', 'confirmPair', 'btn primary mini'));
          duoBar.appendChild(mkBtn('取消', 'clearSel', 'btn ghost mini'));
        } else {
          info.textContent = '已选：' + names.join('、') +
            (hasStar ? '，再点 1 张能与它配成对的牌' : '，再点 1 张手牌');
          duoBar.insertBefore(info, duoBar.firstChild);
          duoBar.appendChild(mkBtn('清空选择', 'clearSel', 'btn ghost mini'));
        }
      }
    }

    // 宣告条
    const callBar = $('call-bar');
    callBar.innerHTML = '';
    if (S.current === 0 && S.phase === 'call') {
      const tip = document.createElement('span');
      tip.className = 'call-tip';
      tip.textContent = '当前 ' + myScore + ' 分（≥7 可宣告）：';
      callBar.appendChild(tip);
      callBar.appendChild(mkBtnRich('Stop<span class="bt-long">（立即结算，无颜色奖励）</span><span class="bt-short"> 立即结算</span>', 'callStop', 'btn danger'));
      callBar.appendChild(mkBtnRich('Last Chance<span class="bt-long">（赌最高，赢加颜色奖励）</span><span class="bt-short"> 赌最高</span>', 'callLastChance', 'btn warn'));
      callBar.appendChild(mkBtn('继续攒分', 'passCall', 'btn ghost'));
    }

    // 玩家区
    $('my-round-score').textContent = myScore;
    $('my-total').textContent = my.total;
    const pHand = $('player-hand');
    pHand.innerHTML = '';
    const pairs = (S.current === 0 && S.phase === 'duo') ? R.duoPairsInHand(my.hand) : [];
    const trios = (S.current === 0 && S.phase === 'duo') ? R.trioCombosInHand(my.hand) : [];
    const pairIds = new Set();
    for (const pr of pairs) for (const id of pr.ids) pairIds.add(id);
    for (const tr of trios) for (const id of tr.ids) pairIds.add(id);
    const selMode = S.current === 0 && S.phase === 'duo';
    for (const c of my.hand) {
      const sel = selection.indexOf(c.id) !== -1;
      const cls = (selMode ? 'clickable' : '') + (sel ? ' selected' : '');
      const el = cardEl(c, 'hand', true, cls, pairIds.has(c.id));
      el.dataset.cardId = c.id;
      if (selMode) el.dataset.action = 'selectHandCard';
      pHand.appendChild(el);
    }
    const pTable = $('player-table');
    pTable.innerHTML = '';
    for (const c of my.table) pTable.appendChild(cardEl(c, 'table', true));

    // 日志与气泡
    const logEl = $('log');
    logEl.innerHTML = '';
    for (const e of S.log.slice(-6)) {
      const d = document.createElement('div');
      d.className = 'log-line ' + e.side;
      d.textContent = (e.side === 'you' ? '你：' : e.side === 'ai' ? 'AI：' : '') + e.text;
      logEl.appendChild(d);
    }
    logEl.scrollTop = logEl.scrollHeight;
    const lastAi = [...S.log].reverse().find(function (e) { return e.side === 'ai'; });
    $('ai-bubble').textContent = lastAi ? lastAi.text : '';

    // 覆盖层
    renderOverlay(S);

    // 飞牌动画（牌进入手牌时从来源飞到手牌位）
    runFx(S);
  }

  // ---------- 飞牌特效 ----------
  const FX_SOURCE = { deck: '#deck', discard0: '#discard-0', discard1: '#discard-1', aiHand: '#ai-hand', playerHand: '#player-hand' };
  function reducedMotion() {
    return global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }
  function runFx(S) {
    if (!S.fx) return;
    const fx = S.fx; S.fx = null;
    if (reducedMotion()) return;
    const srcEl = document.querySelector(FX_SOURCE[fx.from] || '__none__');
    let destEl, size;
    if (fx.to === 'aiHand') {
      const kids = document.querySelectorAll('#ai-hand .card');
      destEl = kids.length ? kids[kids.length - 1] : document.querySelector('#ai-hand');
      size = 'mini';
    } else {
      destEl = document.querySelector('#player-hand [data-card-id="' + fx.cardId + '"]');
      size = 'hand';
    }
    if (!srcEl || !destEl) return;
    flyCard(srcEl, destEl, fx.card, fx.faceUp, size);
  }
  // 影子卡：正面用真实牌面（公开信息），背面用牌背（隐藏信息，如 AI 摸牌/偷牌/蟹拿）
  function ghostHTML(card, faceUp, size) {
    if (faceUp) return cardHTML(card, size);
    return '<div class="card size-' + size + ' back"><svg viewBox="0 0 100 140" preserveAspectRatio="none">' + BACK_SVG + '</svg></div>';
  }
  function flyCard(srcEl, destEl, card, faceUp, size) {
    const s = srcEl.getBoundingClientRect();
    const d = destEl.getBoundingClientRect();
    const ghost = document.createElement('div');
    ghost.className = 'card-fly-ghost';
    ghost.innerHTML = ghostHTML(card, faceUp, size);
    ghost.style.left = (s.left + s.width / 2) + 'px';
    ghost.style.top = (s.top + s.height / 2) + 'px';
    document.body.appendChild(ghost);
    const hideDest = destEl.classList.contains('card');
    if (hideDest) destEl.style.visibility = 'hidden';
    const dx = (d.left + d.width / 2) - (s.left + s.width / 2);
    const dy = (d.top + d.height / 2) - (s.top + s.height / 2);
    let done = false;
    const finish = function () {
      if (done) return; done = true;
      if (hideDest) destEl.style.visibility = '';
      if (ghost.parentNode) ghost.parentNode.removeChild(ghost);
    };
    requestAnimationFrame(function () {
      ghost.style.transform = 'translate(-50%, -50%) translate(' + dx + 'px, ' + dy + 'px)';
    });
    ghost.addEventListener('transitionend', finish);
    setTimeout(finish, 700); // 兜底：transitionend 未触发也要复位
  }

  function mkBtn(text, action, cls) {
    const b = document.createElement('button');
    b.className = cls || 'btn';
    b.dataset.action = action;
    b.textContent = text;
    return b;
  }

  /* 同 mkBtn，但内容是内部拼的 HTML（只用于按钮文案的长/短两套 span，不含用户输入） */
  function mkBtnRich(html, action, cls) {
    const b = document.createElement('button');
    b.className = cls || 'btn';
    b.dataset.action = action;
    b.innerHTML = html;
    return b;
  }

  function pairLabel(type) {
    if (type === 'sharkswimmer') return '鲨鱼+游泳者';
    if (type === 'lobstercrab') return '龙虾+螃蟹';
    if (type === 'jellyfishswimmer') return '水母+游泳者';
    return CARD_TYPES[type].name + '×2';
  }

  // 点选手牌：支持“两张成对”与“海星 + 两张成对牌”的三人组；
  // 每次点完只保留“有可能仍合法”的后缀（如选满 3 张不合法则从最早那张开始退）
  function selectHandCard(id) {
    const S = global.SPGame.state;
    if (!S || S.current !== 0 || S.phase !== 'duo') return;
    const hand = S.players[0].hand;
    if (!hand.some(function (c) { return c.id === id; })) return;
    toggleSelect(id);
    while (selection.length && !R.selectionPromising(hand, selection)) selection.shift();
    render(S);
  }

  function confirmPair() {
    const S = global.SPGame.state;
    if (!S || S.current !== 0 || S.phase !== 'duo') return;
    if (selection.length === 3) {
      if (!R.isValidTrio(S.players[0].hand, selection)) return;
      const ids = selection.slice();
      clearSelection();
      global.SPGame.playTrio(ids);
      return;
    }
    if (selection.length !== 2) return;
    if (!R.isValidPair(S.players[0].hand, selection)) return;
    const ids = selection.slice();
    clearSelection();
    global.SPGame.playPair(ids);
  }

  // 一键打出成对：只打「按下按钮这一刻手里已有的对子」（快照），不做螃蟹“值不值”的取舍。
  // 为什么先固定快照：鱼对抽牌、螃蟹拿牌会把新牌塞进手牌，如果每轮重新枚举，
  // 刚抽到的螃蟹会和手里的螃蟹被自动打出去，夺走玩家“打不打螃蟹”的选择权。
  // 快照存在模块级：被 crabPick 覆盖层打断后，续跑要拿同一份快照接着打，不能重新枚举
  let snapshotPairs = [];
  function autoSuggestPairs() {
    const S = global.SPGame.state;
    if (!S || S.current !== 0 || S.phase !== 'duo') return;
    clearSelection();
    // duoPairsInHand 内部已保证各对子的牌 id 互不重叠
    snapshotPairs = R.duoPairsInHand(S.players[0].hand);
    if (!snapshotPairs.length) { global.SPGame.skipDuos(); return; }
    pendingAutoSuggest = true;
    const deferred = playSnapshotPairs(S);
    if (!deferred) pendingAutoSuggest = false; // 全部打完（或快照失效跳过）；被覆盖层打断则由续跑链末尾清理
  }

  // 把快照里的对子依次打出；遇螃蟹覆盖层则交回调度器等选完后从断点续跑。
  // 返回 true 表示被覆盖层打断、已调度续跑；false 表示正常跑完。
  function playSnapshotPairs(S) {
    const G = global.SPGame;
    for (const pair of snapshotPairs) {
      if (S.phase !== 'duo' || S.current !== 0) break;
      // 只打快照里仍在手里的牌（防悔棋等异常路径让快照 id 失效后误打）
      const owned = S.players[0].hand.filter(function (c) { return pair.ids.indexOf(c.id) !== -1; });
      if (owned.length !== pair.ids.length) continue;
      G.playPair(pair.ids);
      if (S.phase === 'crabPick') {
        scheduleAutoResume(S);
        return true; // 保留 pendingAutoSuggest，由调度器在真正回到 duo 时续跑
      }
    }
    return false;
  }

  // 一次性调度续跑：若此刻仍在 crabPick（或异常中断），稍后重试；回到 duo 才接着打快照里剩下的对子
  let autoResumeTimer = null;
  function scheduleAutoResume(S) {
    if (autoResumeTimer) return;
    autoResumeTimer = setTimeout(function () {
      // 先清 handle 再续跑：快照里若还有一对螃蟹，playSnapshotPairs 会再次 scheduleAutoResume，
      // 不置 null 会被「已有定时器」的防重入挡掉，续跑链断在半路
      autoResumeTimer = null;
      const st = global.SPGame.state;
      if (!pendingAutoSuggest || !st) return;
      if (st.current === 0 && st.phase === 'duo') {
        const deferredAgain = playSnapshotPairs(st);
        if (!deferredAgain) pendingAutoSuggest = false; // 续跑链到头；又遇螃蟹则等下一次调度到点
      } else if (st.phase === 'crabPick' && st.current === 0) {
        scheduleAutoResume(st); // 玩家还没选完，继续等
      } else {
        pendingAutoSuggest = false; // 阶段已流转到别处（取消/结束回合等），放弃续跑
      }
    }, 0);
  }

  function phaseText(S) {
    const myTurn = S.current === 0;
    const inFinal = S.lastChance && S.current !== S.lastChance.caller;
    if (S.phase === 'roundOver') return '本轮结束';
    if (S.phase === 'gameOver') return '游戏结束';
    if (!myTurn) return (S.jellyLock === 1 ? 'AI 被水母定住，本回合只能摸 1 张…' : 'AI 回合中…') + '（点击桌面任意处可加速）';
    if (S.jellyLock === 0 && S.phase === 'draw') return '你被水母定住：只能从牌库摸 1 张';
    switch (S.phase) {
      case 'draw': return inFinal ? '最终回合：摸牌（点击牌库抽2 或 点弃牌堆顶）' : '你的回合：点击牌库抽 2 张（留 1 弃 1），或点弃牌堆顶拿 1 张';
      case 'duo': {
        const base = inFinal ? '最终回合：可点选两张手牌打出成对，然后结束回合' : '点选两张手牌组成对子（再点可取消），确认后打出；或用“自动配对”一次打完';
        // 手里还挂着未使用的额外回合（小船效果）：提醒玩家“先点结束回合才能开始新回合摸牌”，避免停在成对阶段误以为现在就能拿牌
        return S.extraTurns > 0 ? base + '　→　已有额外回合待触发，点“结束回合”后开始' : base;
      }
      case 'keep': return '选择保留 1 张';
      case 'discard': return '选择弃入哪个弃牌堆';
      case 'crabPick': return '螃蟹效果：翻看弃牌堆，选 1 张加入手牌';
      case 'lobsterPick': return '龙虾效果：翻看牌库顶 ' + (S.pendingLobster ? S.pendingLobster.length : 0) + ' 张，选 1 张入手（其余放回重洗）';
      case 'call': return '达到宣告条件';
    }
    return '';
  }

  // ---------- 覆盖层 ----------
  function renderOverlay(S) {
    const ov = $('overlay'), box = $('overlay-card');
    let html = null, interactive = true;

    if (S.phase === 'keep' && S.current === 0) {
      let ref = '';
      for (let i = 0; i < 2; i++) {
        const pile = S.discards[i];
        const top = pile.length ? pile[pile.length - 1] : null;
        ref += '<div class="dc-col ref">' +
          '<div class="dc-label">弃牌堆 ' + (i + 1) + '（' + pile.length + ' 张）</div>' +
          '<div class="dc-top">' + (top ? cardHTML(top, 'table') : '<div class="dc-empty">空</div>') + '</div>' +
          '</div>';
      }
      // 抽二弃一流程（保留/弃置）不提供悔棋：一旦开始选牌，回退到“未抽”状态无意义且易乱
      // 两步选牌：点候选牌→就地高亮并浮出「功能简介 + 拿取」（拿取=保留这张），再点同一张取消
      const previewCard = keepPreviewId != null
        ? S.pendingDraw.filter(function (c) { return c.id === keepPreviewId; })[0] : null;
      const confirmBar = previewCard
        ? '<div class="keep-confirm"><div class="kc-text">' + cardTitle(previewCard).replace('\n', '：') + '</div>' +
          '<button class="btn primary mini" data-action="confirmKeep" data-card-id="' + previewCard.id + '">拿取</button></div>'
        : '';
      html = '<h3>抽到 2 张，点选保留 1 张</h3><div class="row">' +
        S.pendingDraw.map(function (c) {
          const selCls = keepPreviewId === c.id ? ' selected' : '';
          return '<div class="ov-card' + selCls + '" data-action="previewKeep" data-card-id="' + c.id + '">' + cardHTML(c, 'ov') + '</div>';
        }).join('') + '</div>' + confirmBar +
        '<p class="hint">参考：两个弃牌堆当前的顶牌（下一步弃牌会用到）</p>' +
        '<div class="discard-choices">' + ref + '</div>';
    } else if (S.phase === 'discard' && S.current === 0) {
      const t = R.discardTargets(S);
      let cols = '';
      for (let i = 0; i < 2; i++) {
        const pile = S.discards[i];
        const top = pile.length ? pile[pile.length - 1] : null;
        const dis = !t[i];
        const topHtml = top ? cardHTML(top, 'ov') : '<div class="dc-empty">空</div>';
        cols += '<div class="dc-col' + (dis ? ' disabled' : '') + '">' +
          '<div class="dc-label">弃牌堆 ' + (i + 1) + '（' + pile.length + ' 张）</div>' +
          '<div class="dc-top">' + topHtml + '</div>' +
          '<button class="btn mini' + (dis ? ' disabled' : '') + '" data-action="discardTo" data-pile="' + i + '"' + (dis ? ' disabled' : '') + '>弃到这里</button>' +
          '</div>';
      }
      // 同保留阶段：抽二弃一流程不给悔棋
      html = '<h3>弃置这张牌：选弃牌堆</h3>' +
        '<p class="hint">这张牌将放到所选堆的顶部（对手可见）</p>' +
        '<div class="row">' + cardHTML(S.pendingKeep, 'ov') + '</div>' +
        '<div class="discard-choices">' + cols + '</div>' +
        (t[0] !== t[1] ? '<p class="hint">空堆必须优先弃入</p>' : '');
    } else if (S.phase === 'crabPick' && S.current === 0) {
      html = '<h3>螃蟹效果：翻看弃牌堆，选 1 张（对手看不到）</h3>' +
        [0, 1].map(function (i) {
          return '<div class="ov-pile"><div class="ov-pile-title">弃牌堆 ' + (i + 1) + '</div><div class="row">' +
            (S.discards[i].length ? S.discards[i].map(function (c) {
              return '<div class="ov-card" data-action="crabPick" data-pile="' + i + '" data-card-id="' + c.id + '">' + cardHTML(c, 'mini') + '</div>';
            }).join('') : '<span class="hint">空</span>') + '</div></div>';
        }).join('') + '<div class="row">' + undoBtnHTML() + '</div>';
    } else if (S.phase === 'lobsterPick' && S.current === 0) {
      html = '<h3>龙虾效果：翻看牌库顶 ' + S.pendingLobster.length + ' 张，选 1 张入手</h3>' +
        '<p class="hint">其余 ' + (S.pendingLobster.length - 1) + ' 张放回牌库并重新洗整库（对手看不到你拿了哪张）</p>' +
        '<div class="row">' + S.pendingLobster.map(function (c) {
          return '<div class="ov-card" data-action="lobsterPick" data-card-id="' + c.id + '">' + cardHTML(c, 'mini') + '</div>';
        }).join('') + '</div>' +
        '<div class="row">' + undoBtnHTML() + '</div>';
    } else if (S.phase === 'roundOver') {
      interactive = false;
      html = settlementHTML(S);
    } else if (S.phase === 'gameOver') {
      interactive = false;
      html = gameOverHTML(S);
    }

    if (html) {
      box.innerHTML = html;
      ov.classList.remove('hidden');
    } else if (!ov.classList.contains('help')) {
      box.innerHTML = '';
      ov.classList.add('hidden');
      ov.classList.remove('help');
    }
  }

  // 结算明细行（表格用）：[项目, 算法, 得分]；得分为 null 表示不计入本轮。
  // 约束：计入的分数项之和必须恰好等于本轮实发分
  function settleRows(d, bonus, cardCounted, bonusCounted) {
    const rows = [];
    const duoNames = { crab: '螃蟹对', boat: '小船对', fish: '鱼对', sharkswimmer: '鲨鱼＋游泳者', lobstercrab: '龙虾＋螃蟹', jellyfishswimmer: '水母＋游泳者' };
    for (const k of Object.keys(d.duo)) {
      const n = d.duo[k];
      rows.push(['成对得分', duoNames[k] + ' ' + n + ' 对', cardCounted ? n : null]);
    }
    if (d.trio && d.trio.n) {
      rows.push(['海星三人组', d.trio.n + ' 组（每组在对的 1 分上再 +2）', cardCounted ? d.trio.pts : null]);
    }
    const colNames = { shell: '贝壳', octopus: '章鱼', penguin: '企鹅', sailor: '水手' };
    for (const k of Object.keys(d.collectors)) {
      const c = d.collectors[k];
      if (!c.n) continue;
      rows.push(['收藏得分', colNames[k] + ' ' + c.n + ' 张' + (c.wild ? '（含 1 张海马代替）' : ''), cardCounted ? c.pts : null]);
    }
    const colNames2 = { lighthouse: '灯塔', shoal: '鱼群', colony: '企鹅栖息地', captain: '船长', basket: '螃蟹篮' };
    for (const k of Object.keys(d.multipliers)) {
      const m = d.multipliers[k];
      if (!m.pts) continue;
      rows.push(['倍增加分', m.n + ' 张' + CARD_TYPES[m.target].name + '，每张加 ' + m.per + ' 分（' + colNames2[k] + '）', cardCounted ? m.pts : null]);
    }
    if (d.mermaidPoints) {
      rows.push(['美人鱼', d.mermaidCounts.length + ' 张，每张 = 一个颜色的牌数（' + d.mermaidCounts.join('，') + '）', cardCounted ? d.mermaidPoints : null]);
    }
    if (bonusCounted || bonus > 0) {
      rows.push(['颜色奖励', '最多的颜色有 ' + bonus + ' 张牌', bonusCounted ? bonus : null]);
    }
    return rows;
  }

  // 结算时亮出某方全部手牌（roundOver 阶段手牌不变，此刻公开不泄露进行中信息）
  function handRevealHTML(p) {
    let h = '<div class="settle-hand-title">手牌 ' + p.hand.length + ' 张（已公开）</div><div class="settle-hand">';
    if (!p.hand.length) h += '<span class="hint">无手牌</span>';
    for (const c of p.hand) h += cardHTML(c, 'mini');
    return h + '</div>';
  }

  function settleTableHTML(name, rows, totalHtml, handHtml) {
    let h = '<div class="settle"><div class="settle-head">' + name + '</div>' + (handHtml || '');
    for (const r of rows) {
      h += '<div class="settle-row"><span class="s-item">' + r[0] + '</span><span class="s-desc">' + r[1] + '</span><span class="s-pts">' + (r[2] === null ? '不计' : '+' + r[2]) + '</span></div>';
    }
    return h + '<div class="settle-row settle-total"><span class="s-item">合计</span><span class="s-desc">' + totalHtml + '</span><span class="s-pts"></span></div></div>';
  }

  function settlementHTML(S) {
    const res = S.roundResult;
    if (res.noScore) {
      return '<h3>本轮无人得分</h3><p class="hint">牌库已空且无牌可摸，本轮直接结束，双方总分不变。</p>' +
        '<div class="settle">' + handRevealHTML(S.players[0]) + '</div>' +
        '<div class="settle">' + handRevealHTML(S.players[1]) + '</div>' +
        '<div class="row"><button class="btn primary" data-action="continueAfterRound">继续</button></div>';
    }
    const modeName = res.mode === 'stop' ? 'STOP（直接结算）' : 'LAST CHANCE（最后一搏）';
    const callerName = res.callerIdx === 0 ? '你' : 'AI';
    const oppName = res.callerIdx === 0 ? 'AI' : '你';
    const d0 = res.details[0], d1 = res.details[1];
    let html = '<h3>本轮结算 · ' + callerName + ' 宣告了 ' + modeName + '</h3>';
    if (res.mode === 'stop') {
      html += '<p class="hint">STOP：双方都拿自己的牌分，本模式没有颜色奖励。</p>';
    } else {
      const cmp = d0.total === d1.total ? '两人牌分打平（' + d0.total + ' 分），平局算宣告者赢' : '牌分更高的是' + (d0.total > d1.total ? '你' : 'AI') + '（' + Math.max(d0.total, d1.total) + ' 分对 ' + Math.min(d0.total, d1.total) + ' 分）';
      html += '<p class="hint">LAST CHANCE：' + cmp + '。' + (res.callerWon
        ? callerName + ' 赌对了，拿“牌分 + 颜色奖励”，' + oppName + ' 只拿颜色奖励。'
        : callerName + ' 没赌过，只拿颜色奖励，' + oppName + ' 拿自己的牌分。') + '</p>';
    }
    for (const i of [0, 1]) {
      const isCaller = res.callerIdx === i;
      const name = (i === 0 ? '你' : 'AI') + (res.mode === 'lastchance' ? (isCaller ? '（宣告者）' : '（对手）') : '');
      const d = res.details[i];
      const bonus = R.colorBonus(S.players[i]); // 不用 res.bonuses（stop 下被置 0）
      // 实发分归属（与 resolveRound 一致）：Stop 双方拿牌分；Last Chance 赌赢=宣告者拿牌分+颜色、对手只拿颜色；赌输=宣告者只拿颜色、对手拿牌分
      const cardCounted = res.mode === 'stop' || (isCaller ? res.callerWon : !res.callerWon);
      const bonusCounted = res.mode === 'lastchance' && (isCaller || res.callerWon);
      const rows = settleRows(d, bonus, cardCounted, bonusCounted);
      let totalTxt;
      if (cardCounted && bonusCounted) {
        totalTxt = '牌分 ' + d.total + ' + 颜色奖励 ' + bonus + '，本轮得 ' + res.scores[i] + ' 分，总分达到 ' + S.players[i].total + ' 分';
      } else if (cardCounted) {
        totalTxt = (res.mode === 'lastchance' ? '对方赌输，你拿牌分，' : '') + '本轮得 ' + res.scores[i] + ' 分，总分达到 ' + S.players[i].total + ' 分';
      } else if (bonusCounted) {
        totalTxt = (isCaller ? '宣告者牌分落后，' : '对方赌赢，') + '只拿颜色奖励 ' + bonus + ' 分，本轮得 ' + res.scores[i] + ' 分，总分达到 ' + S.players[i].total + ' 分';
      } else {
        totalTxt = '本轮得 ' + res.scores[i] + ' 分，总分达到 ' + S.players[i].total + ' 分';
      }
      html += settleTableHTML(name, rows, totalTxt, handRevealHTML(S.players[i]));
    }
    html += '<div class="row"><button class="btn primary" data-action="continueAfterRound">继续</button></div>';
    return html;
  }

  function gameOverHTML(S) {
    const g = S.gameOver;
    const t0 = S.players[0].total, t1 = S.players[1].total;
    const win = g.winner === 0;
    let html = '<h3>' + (win ? '你赢了！' : 'AI 获胜') + '</h3>';
    html += '<p>' + (g.byMermaid ? (win ? '你' : 'AI') + ' 集齐 4 张美人鱼，直接获胜。' : (t0 === t1 ? '平分，最后行动者胜。' : '达到 ' + SPGame.TARGET + ' 分终局。')) + '</p>';
    html += '<p class="score-line">你：' + t0 + ' ｜ AI：' + t1 + '</p>';
    html += '<div class="row"><button class="btn primary" data-action="newGame">再来一局</button>' +
      '<button class="btn ghost" data-action="' + (S.useExp ? 'newGameNoExp' : 'newGameWithExp') + '">再来一局（' + (S.useExp ? '只用基础 58 张' : '含一扩 66 张') + '）</button></div>';
    return html;
  }

  // ---------- 帮助 ----------
  const HELP_HTML = '<h3>《海盐折纸》规则速查</h3>' +
    '<div class="help-sec"><div class="help-sec-title">一个回合做三件事</div>' +
    '<ol class="help-steps">' +
    '<li><b>摸牌</b>（必做，二选一）：牌库抽 2 留 1 弃 1（弃入空的弃牌堆优先）｜或拿某弃牌堆顶 1 张</li>' +
    '<li><b>打对</b>（可选，可连续）：每 2 张同名（或 鲨鱼+游泳者）打到面前并触发效果</li>' +
    '<li><b>宣告</b>（可选）：手牌+面前 ≥ 7 分才能按 Stop / Last Chance，否则回合结束</li>' +
    '</ol></div>' +

    '<div class="help-sec"><div class="help-sec-title">成对牌·每对 1 分，额外触发效果</div>' +
    '<table class="help-tb kv">' +
    '<tr><td>螃蟹 ×2</td><td>翻看弃牌堆，拿 1 张入手</td></tr>' +
    '<tr><td>小船 ×2</td><td>立即再行动一回合</td></tr>' +
    '<tr><td>鱼 ×2</td><td>抽牌库顶 1 张入手</td></tr>' +
    '<tr><td>鲨鱼 + 游泳者</td><td>偷对手 1 张随机手牌</td></tr>' +
    '</table></div>' +

    '<div class="help-sec"><div class="help-sec-title">收藏牌·按手里张数计分</div>' +
    '<table class="help-tb">' +
    '<tr><th>＼张数</th><th>1</th><th>2</th><th>3</th><th>4</th><th>5</th><th>6</th></tr>' +
    '<tr><td>贝壳</td><td>0</td><td>2</td><td>4</td><td>6</td><td>8</td><td>10</td></tr>' +
    '<tr><td>章鱼</td><td>0</td><td>3</td><td>6</td><td>9</td><td>12</td><td>—</td></tr>' +
    '<tr><td>企鹅</td><td>1</td><td>3</td><td>5</td><td>—</td><td>—</td><td>—</td></tr>' +
    '<tr><td>水手</td><td>0</td><td>5</td><td>—</td><td>—</td><td>—</td><td>—</td></tr>' +
    '</table></div>' +

    '<div class="help-sec"><div class="help-sec-title">倍增牌·只有目标准在手里才加分</div>' +
    '<table class="help-tb kv">' +
    '<tr><td>灯塔</td><td>每张 小船 +1</td></tr>' +
    '<tr><td>鱼群</td><td>每张 鱼 +1</td></tr>' +
    '<tr><td>企鹅栖息地</td><td>每张 企鹅 +2</td></tr>' +
    '<tr><td>船长</td><td>每张 水手 +3</td></tr>' +
    '</table></div>' +

    '<div class="help-sec"><div class="help-sec-title">美人鱼</div>' +
    '<p class="help-p">每张 = 你“最多颜色”的牌数（各张要对应不同颜色）；集齐 <b>4 张</b> 立刻获胜。</p></div>' +

    '<div class="help-sec"><div class="help-sec-title">两种宣告怎么算分</div>' +
    '<p class="help-p">手牌+面前 ≥ 7 分时，你可以喊停，有两种喊法（AI 喊停时同理，只是角色对调）：</p>' +
    '<div class="help-call"><b>STOP · 稳妥收</b><br>立刻结算，你和对手<b>各拿自己的牌分</b>，这一轮<b>没有</b>颜色奖励。</div>' +
    '<div class="help-call"><b>LAST CHANCE · 赌一把</b><br>你先亮牌，对手还能再走 1 回合，然后比两人的<b>牌分</b>高低：' +
    '<ul class="help-ul">' +
    '<li>你牌分 <b>≥</b> 对手 → 你<b>赌赢</b>：你拿“牌分＋颜色奖励”，对手只拿“颜色奖励”</li>' +
    '<li>你牌分 <b>&lt;</b> 对手 → 你<b>赌输</b>：你只拿“颜色奖励”，对手拿“他的牌分”</li>' +
    '</ul>' +
    '<span class="help-eg">举个例子：你牌分 11、颜色奖励 4；对手牌分 8、颜色奖励 3。因为 11 ≥ 8，你赌赢 → 你得 11＋4＝<b>15</b> 分，对手只拿颜色奖励 <b>3</b> 分。</span></div>' +
    '<p class="help-p">颜色奖励 = 你手里最多的那种颜色，一共有几张牌。</p></div>' +

    '<div class="help-sec"><div class="help-sec-title">结束与胜负</div>' +
    '<ul class="help-ul">' +
    '<li>牌库摸完时回合结束 → 本轮无人得分</li>' +
    '<li>累计先到 <b>40 分</b> 结束，总分高者胜；平分则最后行动者胜</li>' +
    '</ul></div>';

  // ---------- 规则书（完整） ----------
  const SUB = 'help-sec-title';
  const RULEBOOK_HTML = '<h3>《海盐折纸》规则书</h3>' +
    '<p class="help-p">1 名玩家对战 AI，多轮累计得分，先达到 <b>40 分</b> 者胜。按“准备→回合→计分→结算→胜负”讲全。</p>' +

    '<div class="help-sec"><div class="' + SUB + '">一、准备</div>' +
    '<ul class="help-ul">' +
    '<li>一副 <b>58 张</b>牌：14 种图案 × 不同颜色（共 11 色），洗匀成牌库。</li>' +
    '<li>桌上放 <b>两个弃牌堆</b>（初始为空，只暴露顶牌）。</li>' +
    '<li>随机决定先手；起手各 0 张，每回合现摸。</li>' +
    '<li>每张牌有 1 个<b>颜色</b>（看整张牌的背景色），用于颜色奖励与美人鱼。</li>' +
    '</ul></div>' +

    '<div class="help-sec"><div class="' + SUB + '">二、一个回合（按顺序）</div>' +
    '<div class="help-call"><b>① 摸牌——必须，二选一</b><br>' +
    '<b>A</b>：从牌库抽 2 张，选 1 张留入手、另 1 张弃到任一弃牌堆顶（某堆为空则必须弃入空堆）；<br>' +
    '<b>B</b>：直接拿走某个弃牌堆的顶牌 1 张入手。<br>' +
    '<span class="help-eg">牌库不足 2 张时只能选 B；牌库与两堆都空则无法摸牌。</span></div>' +
    '<div class="help-call"><b>② 成对——可选，可连续多次</b><br>手里每有 2 张同名牌（或 1 鲨鱼+1 游泳者），就能打到面前得 1 分并触发效果；4 张同名=2 对=2 分。也可以一对都不打。</div>' +
    '<div class="help-call"><b>③ 宣告——可选</b><br>当“手牌+面前”合计 <b>≥ 7 分</b> 时，可喊 Stop 或 Last Chance 结束本轮；不喊就回合结束、把行动权交给对手。</div>' +
    '</div>' +

    '<div class="help-sec"><div class="' + SUB + '">三、牌型与计分（手牌+面前合并算）</div>' +
    '<div class="' + SUB + '" style="border:none;padding:2px 0;font-size:12px">成对牌 Duo——每成 1 对得 1 分，另触发效果</div>' +
    '<table class="help-tb kv">' +
    '<tr><td>螃蟹 ×2</td><td>翻看弃牌堆，暗取 1 张入手（对手看不到）</td></tr>' +
    '<tr><td>小船 ×2</td><td>立即再行动一回合</td></tr>' +
    '<tr><td>鱼 ×2</td><td>从牌库顶抽 1 张入手</td></tr>' +
    '<tr><td>鲨鱼 + 游泳者</td><td>从对手手里随机偷 1 张入手</td></tr>' +
    '</table>' +
    '<div class="' + SUB + '" style="border:none;padding:6px 0 2px;font-size:12px">收藏牌 Collector——按手里该牌张数计分</div>' +
    '<table class="help-tb">' +
    '<tr><th>＼张数</th><th>1</th><th>2</th><th>3</th><th>4</th><th>5</th><th>6</th></tr>' +
    '<tr><td>贝壳</td><td>0</td><td>2</td><td>4</td><td>6</td><td>8</td><td>10</td></tr>' +
    '<tr><td>章鱼</td><td>0</td><td>3</td><td>6</td><td>9</td><td>12</td><td>—</td></tr>' +
    '<tr><td>企鹅</td><td>1</td><td>3</td><td>5</td><td>—</td><td>—</td><td>—</td></tr>' +
    '<tr><td>水手</td><td>0</td><td>5</td><td>—</td><td>—</td><td>—</td><td>—</td></tr>' +
    '</table>' +
    '<div class="' + SUB + '" style="border:none;padding:6px 0 2px;font-size:12px">倍增牌 Multiplier——只有目标牌在你手里才加分</div>' +
    '<table class="help-tb kv">' +
    '<tr><td>灯塔</td><td>每张 小船 +1</td></tr>' +
    '<tr><td>鱼群</td><td>每张 鱼 +1</td></tr>' +
    '<tr><td>企鹅栖息地</td><td>每张 企鹅 +2</td></tr>' +
    '<tr><td>船长</td><td>每张 水手 +3</td></tr>' +
    '</table>' +
    '<p class="help-p"><b>美人鱼</b>：每张 = 你“最多颜色”的牌数（各张要对应不同颜色）；<b>集齐 4 张</b>立即获胜。</p>' +
    '</div>' +

    '<div class="help-sec"><div class="' + SUB + '">四、颜色奖励</div>' +
    '<p class="help-p">你“手牌+面前”里<b>同色最多的那一种</b>有几张，就值几分为颜色奖励。<b>只有 Last Chance 结算时才用到</b>（Stop 没有颜色奖励）。</p>' +
    '<p class="help-p">11 种颜色除了整张牌的底色，牌面左上角还有一个固定的<b>识别图形</b>（底色看不准时认图形）：</p>' +
    colorLegendHTML() + '</div>' +

    '<div class="help-sec"><div class="' + SUB + '">五、宣告与本轮结算</div>' +
    '<div class="help-call"><b>STOP · 稳妥收</b><br>立即结算，你和对手<b>各拿自己的牌分</b>，本轮<b>没有</b>颜色奖励。</div>' +
    '<div class="help-call"><b>LAST CHANCE · 赌一把</b><br>你先亮牌，对手还能再走 1 回合，然后比两人<b>牌分</b>高低：' +
    '<ul class="help-ul">' +
    '<li>你牌分 <b>≥</b> 对手（平分算你赢）→ 你<b>赌赢</b>：你拿“牌分＋颜色奖励”，对手只拿“颜色奖励”</li>' +
    '<li>你牌分 <b>&lt;</b> 对手 → 你<b>赌输</b>：你只拿“颜色奖励”，对手拿“他的牌分”</li>' +
    '</ul>' +
    '<span class="help-eg">例：你牌分 11、颜色 4；对手牌分 8、颜色 3。11 ≥ 8 你赌赢 → 你得 11＋4＝15，对手只得颜色 3。</span></div>' +
    '</div>' +

    '<div class="help-sec"><div class="' + SUB + '">六、结束与胜负</div>' +
    '<ul class="help-ul">' +
    '<li>本轮结束后累计总分，任一方 <b>≥ 40 分</b> → 游戏结束，总分高者胜。</li>' +
    '<li>总分<b>平分</b>：本轮里最后行动的人胜。</li>' +
    '<li>任一玩家回合结束时<b>牌库已空</b> → 本轮立即结束、<b>无人得分</b>。</li>' +
    '<li>任何时候有人集齐 <b>4 张美人鱼</b> → 立即获胜。</li>' +
    '<li>开新一轮：所有牌重洗入牌库、弃牌堆清空，由上一轮结束者的<b>下家</b>先手。</li>' +
    '</ul></div>' +

    '<div class="help-sec"><div class="' + SUB + '">七、易错点</div>' +
    '<ul class="help-ul">' +
    '<li>成对牌<b>不打也计分</b>：手里凑成一对就算 1 分，是否打出只影响要不要触发效果。</li>' +
    '<li>“≥ 7 分”只是<b>可以</b>宣告，不是必须；继续攒分往往更高。</li>' +
    '<li>颜色看<b>整张牌背景</b>，不是图案本身的颜色。</li>' +
    '<li>螃蟹拿牌、AI 摸牌都是<b>暗进行</b>的，你看不到具体牌。</li>' +
    '</ul></div>';

  // ---------- 事件绑定 ----------
  function bind() {
    document.addEventListener('click', function (ev) {
      const el = ev.target.closest('[data-action]');
      const cardNode = ev.target.closest('.card[data-card-id]');
      // 说明模式：点牌只看说明，不执行牌上挂的动作（避开“点牌=选牌”冲突）
      if (infoMode && cardNode) { showCardInfo(+cardNode.dataset.cardId); return; }
      if (!el || el.classList.contains('disabled')) {
        // 没有动作可做的牌（面前的牌、AI 的牌、不能拿的弃牌堆顶等）直接弹说明：
        // 触屏上没有 tooltip，这是唯一的就地查看入口
        if (!el && cardNode) showCardInfo(+cardNode.dataset.cardId);
        return;
      }
      const a = el.dataset.action;
      const G = global.SPGame;
      if (a === 'help') { showPanel(HELP_HTML + expNoteHTML()); return; }
      if (a === 'rulebook') { showPanel(RULEBOOK_HTML + expNoteHTML()); return; }
      if (a === 'closeOverlay') { hidePanel(); return; }
      switch (a) {
        case 'previewTake': {
          const kind = el.dataset.kind;
          const pile = el.dataset.pile != null ? +el.dataset.pile : null;
          const same = takePreview && takePreview.kind === kind && takePreview.pile === pile;
          takePreview = same ? null : { kind: kind, pile: pile }; // 再点同一张 = 取消预览
          G && render(G.state);
          break;
        }
        case 'confirmTake': {
          const kind = el.dataset.kind;
          takePreview = null;
          if (kind === 'deck') G.drawFromDeck();
          else G.takeDiscard(+el.dataset.pile);
          break;
        }
        case 'drawFromDeck': G.drawFromDeck(); break;
        case 'previewKeep': {
          const id = +el.dataset.cardId;
          keepPreviewId = keepPreviewId === id ? null : id; // 再点同一张 = 取消预览
          G && render(G.state);
          break;
        }
        case 'confirmKeep': {
          keepPreviewId = null;
          G.keepCard(+el.dataset.cardId);
          break;
        }
        case 'selectHandCard': selectHandCard(+el.dataset.cardId); break;
        case 'confirmPair': confirmPair(); break;
        case 'clearSel': clearSelection(); G && render(G.state); break;
        case 'autoSuggestPairs': autoSuggestPairs(); break;
        case 'discardTo': G.discardTo(+el.dataset.pile); break;
        case 'playPair': G.playPair(el.dataset.ids.split(',').map(Number)); break;
        case 'crabPick': G.crabPick(+el.dataset.pile, +el.dataset.cardId); break;
        case 'lobsterPick': G.lobsterPick(+el.dataset.cardId); break;
        case 'skipDuos': G.skipDuos(); break;
        case 'callStop': G.callStop(); break;
        case 'callLastChance': G.callLastChance(); break;
        case 'passCall': G.passCall(); break;
        case 'continueAfterRound': G.continueAfterRound(); break;
        // “再来一局”保持当前的一扩设置与皮肤不变
        case 'newGame': { const keep = !!(G.state && G.state.useExp); G.newGame({ useExp: keep }); hidePanel(); break; }
        case 'newGameWithExp': G.newGame({ useExp: true }); hidePanel(); break;
        case 'newGameNoExp': G.newGame({ useExp: false }); hidePanel(); break;
        // 开始页：选皮肤 / 直接开局
        case 'pickSkinOrigami': setSkin('origami'); break;
        case 'pickSkinSticker': setSkin('sticker'); break;
        case 'startBasic': startFromMenu(false); break;
        case 'startExp': startFromMenu(true); break;
        case 'undo': doUndo(); break;
      }
    });
    // 点击桌面（非按钮）加速 AI
    document.getElementById('app').addEventListener('click', function (ev) {
      if (ev.target.closest('[data-action]')) return;
      global.SPGame.speedUp();
    });
    // 牌库区的 ↶（悔棋）与右侧竖排的 !（规则书）/ ?（速查）走 data-action 统一派发；
    // 带上 data-action 也顺带避开“点桌面加速 AI”的默认行为。
    // ESC 关闭当前弹层
    document.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape') { const ov = $('overlay'); if (ov && !ov.classList.contains('hidden')) hidePanel(); }
    });
  }
  
  // 规则书/速查底部的“一扩”章节（带本局是否启用）
  function expNoteHTML() {
    const S = global.SPGame.state;
    const on = !!(S && S.useExp);
    return '<div class="help-sec"><div class="help-sec-title">一扩 Extra Salt（本局' + (on ? '已启用，牌库 66 张' : '未启用，牌库 58 张') + '）</div>' +
      '<table class="help-tb kv">' +
      '<tr><td>水母 ×2</td><td>与游泳者成对得 1 分；打出后对手下一回合只能从牌库摸 1 张，不出牌、不可宣告</td></tr>' +
      '<tr><td>龙虾 ×1</td><td>与螃蟹成对得 1 分；打出后看牌库顶 5 张，选 1 张入手，其余放回并重洗牌库</td></tr>' +
      '<tr><td>海星 ×3</td><td>与任意一对打到面前 = 一组三人组共 3 分，但取消那一对的效果（手里凑齐一对时不打出也 +2 分）</td></tr>' +
      '<tr><td>海马 ×1</td><td>代替 1 张你已持有的收藏牌（贝壳/章鱼/企鹅/水手），不超过该牌最高分</td></tr>' +
      '<tr><td>螃蟹篮 ×1</td><td>倍增牌：每张螃蟹 +1 分（本牌自身不算螃蟹）</td></tr>' +
      '</table>' +
      '<p class="help-p">一扩牌面左上角在颜色图标旁边多一个「扩」角标；逐张颜色已按官方牌表校正，可在<a href="cards.html">牌表页</a>逐张校看。一扩的开关在开局前的开始页选择。</p></div>';
  }

  // hideClose：弹层自带语义化按钮（如“确认并重开 / 取消”）时不再追加通用“关闭”
  function showPanel(html, hideClose) {
    const ov = $('overlay'), box = $('overlay-card');
    box.innerHTML = html + (hideClose ? '' :
      '<div class="row"><button class="btn ghost" data-action="closeOverlay">关闭</button></div>');
    ov.classList.remove('hidden');
    ov.classList.add('help');
  }

  function hidePanel() {
    const ov = $('overlay');
    ov.classList.add('hidden');
    ov.classList.remove('help');
    // 弹层（说明/规则书/速查）可能是盖在 keep/discard/crabPick/lobsterPick 交互层上面的：
    // 关掉后必须重绘，否则被顶掉的选牌界面不会再出现，玩家就没牌可选了
    const S = global.SPGame.state;
    if (S) render(S);
  }

  // ---------- 开始页 ----------
  // 进页不再直接开局：先在这页选皮肤 + 选牌库（基础/含一扩），以后对手数量等选项也放这里。
  // 皮肤预览用螃蟹+小船两张代表图（一张动物、一张物体，两套风格差异最直观）。
  function startCardPreview(skinName) {
    const art = ARTS[skinName] || ART;
    const previewTypes = ['crab', 'boat'];
    return previewTypes.map(function (t) {
      return '<svg class="card-art" viewBox="0 0 100 100" style="width:56px;height:56px">' + (art[t] || '') + '</svg>';
    }).join('');
  }

  function renderStartPage() {
    const el = $('start-page');
    if (!el) return;
    const skinCard = function (name, label, note) {
      const on = skin === name;
      return '<div class="ss-skin' + (on ? ' on' : '') + '" data-action="' + (name === 'sticker' ? 'pickSkinSticker' : 'pickSkinOrigami') + '" role="button" tabindex="0">' +
        startCardPreview(name) +
        '<div class="ss-skin-name">' + label + (on ? ' ✓' : '') + '</div>' +
        '<div class="ss-skin-note">' + note + '</div></div>';
    };
    el.innerHTML =
      '<div class="ss-inner">' +
      '<h2 class="ss-title">海盐折纸</h2>' +
      '<p class="ss-sub">Sea Salt &amp; Paper 网页版 · 你 vs AI</p>' +
      '<div class="ss-skins">' +
      skinCard('origami', '折纸风', '默认：手写矢量插画') +
      skinCard('sticker', '卡通贴纸风', '粗描边 + 平涂') +
      '</div>' +
      '<div class="ss-btns">' +
      '<button class="btn primary" data-action="startExp">开始（含一扩 · 66 张）</button>' +
      '<button class="btn ghost" data-action="startBasic">只用基础牌（58 张）</button>' +
      '</div>' +
      '<p class="ss-tip">皮肤随时可在这页换；牌表页也能预览两套图。</p>' +
      '</div>';
    el.classList.remove('hidden');
  }

  // 从开始页开局：隐藏开始页，按当前皮肤重开一局
  function startFromMenu(useExp) {
    const el = $('start-page');
    if (el) el.classList.add('hidden');
    global.SPGame.newGame({ useExp: useExp });
  }

  // ---------- 启动 ----------
  function init() {
    bind();
    clearSelection();
    global.SPGame.onChange(render);
    // 不自动开局：先停在开始页，玩家选皮肤/牌库后才 newGame
    renderStartPage();
  }

  // 牌表页（cards.html）只加载牌数据与本文件，没有棋盘 DOM → 不能自动开局
  if (typeof document !== 'undefined' && document.getElementById('app')) {
    (document.readyState === 'loading')
      ? document.addEventListener('DOMContentLoaded', init)
      : init();
  }

  global.SPUI = {
    render: render, cardEl: cardEl, clearSelection: clearSelection,
    autoSuggestPairs: autoSuggestPairs, // 供 tests.js 验证「快照式自动配对」不吞刚抽到的牌
    cardHTML: cardHTML, cardTitle: cardTitle,
    ART: ART, ART_STICKER: ART_STICKER, get skin() { return skin; }, setSkin: setSkin, // 皮肤：牌表页切换用
    EFFECT_TEXT: EFFECT_TEXT, EFFECT_LONG: EFFECT_LONG, KIND_LABEL: KIND_LABEL,
    COLOR_ICON: COLOR_ICON, colorIconHTML: colorIconHTML,
  };
})(typeof window !== 'undefined' ? window : globalThis);
