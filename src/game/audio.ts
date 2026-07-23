// =============================================================
// 大鱼吃小鱼 · WebAudio 合成音频（零音频文件，全部程序化合成）
// 契约（plan.md §2.1）：
//   audio.unlock() / play(n) / startBgm() / stopBgm() / setMuted(m)
// 实现要点：
//   - lazy AudioContext：仅 unlock()（首次用户手势）里创建+resume。
//   - context 未 unlock / 非 running / 已静音时，play 一律静默跳过。
//   - eat 内置连吃计数：1.2s 内连续 eat 音调渐升（最多 +72%），制造连吃爽感。
//   - setMuted 持久化 localStorage 键 'bigfish.muted'，模块加载时读取。
//   - startBgm/stopBgm 幂等，可随 React StrictMode 双跑安全重复调用。
// =============================================================
import type { SfxName } from './types';

const MUTE_KEY = 'bigfish.muted';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;
let muted = readMuted();

// 连吃/连击计数（模块内部状态，不改动契约签名）
let eatChain = 0;
let eatLast = 0;
let comboChain = 0;
let comboLast = 0;

interface BgmState {
  gain: GainNode;
  oscs: OscillatorNode[];
  timer: number;
}
let bgm: BgmState | null = null;

function readMuted(): boolean {
  try {
    return (
      typeof localStorage !== 'undefined' &&
      localStorage.getItem(MUTE_KEY) === '1'
    );
  } catch {
    return false;
  }
}

function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function makeNoise(c: AudioContext): AudioBuffer {
  const len = c.sampleRate;
  const buf = c.createBuffer(1, len, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

// -------------------------------------------------------------
// 合成原语
// -------------------------------------------------------------

/** 单音：频率可滑（f0→f1），快攻慢衰包络。 */
function tone(o: {
  f0: number;
  f1?: number;
  dur: number;
  type?: OscillatorType;
  vol?: number;
  at?: number;
}): void {
  if (!ctx || !master) return;
  const t0 = ctx.currentTime + (o.at ?? 0);
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = o.type ?? 'sine';
  osc.frequency.setValueAtTime(Math.max(1, o.f0), t0);
  if (o.f1 !== undefined) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.f1), t0 + o.dur);
  }
  const v = o.vol ?? 0.3;
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(v, t0 + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
  osc.connect(g);
  g.connect(master);
  osc.start(t0);
  osc.stop(t0 + o.dur + 0.05);
}

/** 滤波噪声：whoosh / 爆轰 / 碎裂 的骨架。 */
function noiseBurst(o: {
  dur: number;
  f0: number;
  f1?: number;
  type?: BiquadFilterType;
  q?: number;
  vol?: number;
  at?: number;
}): void {
  if (!ctx || !master || !noiseBuf) return;
  const t0 = ctx.currentTime + (o.at ?? 0);
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  const flt = ctx.createBiquadFilter();
  flt.type = o.type ?? 'bandpass';
  flt.frequency.setValueAtTime(Math.max(10, o.f0), t0);
  if (o.f1 !== undefined) {
    flt.frequency.exponentialRampToValueAtTime(Math.max(10, o.f1), t0 + o.dur);
  }
  flt.Q.value = o.q ?? 1;
  const g = ctx.createGain();
  const v = o.vol ?? 0.3;
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(v, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
  src.connect(flt);
  flt.connect(g);
  g.connect(master);
  src.start(t0);
  src.stop(t0 + o.dur + 0.05);
}

/** 震颤音（stun 用）：载波 + 低频 LFO 调制音量。 */
function wobbleTone(carrier: number, dur: number, vol: number): void {
  if (!ctx || !master) return;
  const t0 = ctx.currentTime;
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.value = carrier;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(vol, t0 + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 14;
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = vol * 0.7;
  lfo.connect(lfoGain);
  lfoGain.connect(g.gain);
  osc.connect(g);
  g.connect(master);
  osc.start(t0);
  lfo.start(t0);
  osc.stop(t0 + dur + 0.05);
  lfo.stop(t0 + dur + 0.05);
}

// -------------------------------------------------------------
// SFX 全集（18 种，每种追求辨识度）
// -------------------------------------------------------------
function play(n: SfxName): void {
  if (!ctx || !master || muted) return;
  if (ctx.state !== 'running') {
    // 已创建但被系统挂起（如 iOS 切后台）：尝试恢复，本次静默跳过
    void ctx.resume().catch(() => undefined);
    return;
  }
  switch (n) {
    case 'eat': {
      // 短促吞咽下滑音；1.2s 连吃窗口内音调渐升，制造连吃爽感
      const t = now();
      if (t - eatLast > 1200) eatChain = 0;
      eatLast = t;
      eatChain++;
      const k = 1 + Math.min(eatChain, 12) * 0.06;
      tone({ f0: 540 * k, f1: 190 * k, dur: 0.13, type: 'sine', vol: 0.5 });
      break;
    }
    case 'eatBig':
      // 吞大鱼：更低更厚的下滑 + 一声闷响
      tone({ f0: 300, f1: 78, dur: 0.22, type: 'triangle', vol: 0.6 });
      noiseBurst({ dur: 0.18, f0: 220, type: 'lowpass', vol: 0.25 });
      break;
    case 'coin':
      // 双音叮（E6 → A6）
      tone({ f0: 1318.5, dur: 0.07, type: 'sine', vol: 0.24 });
      tone({ f0: 1760, dur: 0.09, type: 'sine', vol: 0.22, at: 0.07 });
      break;
    case 'dash':
      // 滤波噪声 whoosh
      noiseBurst({ dur: 0.3, f0: 500, f1: 2600, type: 'bandpass', q: 1.2, vol: 0.35 });
      break;
    case 'skill':
      // 通用技能：三音火花
      tone({ f0: 660, dur: 0.1, type: 'triangle', vol: 0.2 });
      tone({ f0: 880, dur: 0.1, type: 'triangle', vol: 0.2, at: 0.05 });
      tone({ f0: 990, dur: 0.14, type: 'triangle', vol: 0.18, at: 0.1 });
      break;
    case 'death':
      // 下沉哀鸣
      tone({ f0: 280, f1: 55, dur: 0.85, type: 'sawtooth', vol: 0.35 });
      noiseBurst({ dur: 0.6, f0: 400, f1: 80, type: 'lowpass', vol: 0.14 });
      break;
    case 'chest':
      // 宝箱出现：木箱闷咚 + 一声轻铃
      tone({ f0: 196, dur: 0.28, type: 'sine', vol: 0.3 });
      tone({ f0: 523.25, dur: 0.2, type: 'sine', vol: 0.14, at: 0.1 });
      break;
    case 'chestOpen': {
      // 八音盒琶音 C6 E6 G6 C7
      const notes = [1046.5, 1318.5, 1568, 2093];
      notes.forEach((fq, i) =>
        tone({ f0: fq, dur: 0.5, type: 'sine', vol: 0.16, at: i * 0.09 }),
      );
      break;
    }
    case 'ui':
      tone({ f0: 760, dur: 0.05, type: 'square', vol: 0.1 });
      break;
    case 'pickup':
      // 拾取：上滑气泡音
      tone({ f0: 500, f1: 980, dur: 0.1, type: 'sine', vol: 0.3 });
      break;
    case 'bomb':
      // 低频爆轰 + 噪声
      tone({ f0: 110, f1: 28, dur: 0.55, type: 'sine', vol: 0.7 });
      noiseBurst({ dur: 0.5, f0: 900, f1: 120, type: 'lowpass', vol: 0.5 });
      break;
    case 'rainbow': {
      // 上升彩虹琶音（五声音阶 C5→C6）
      const notes = [523.25, 587.33, 659.25, 783.99, 880, 1046.5];
      notes.forEach((fq, i) =>
        tone({ f0: fq, dur: 0.18, type: 'triangle', vol: 0.2, at: i * 0.07 }),
      );
      break;
    }
    case 'levelup': {
      // 升级：大三和弦上行
      const notes = [523.25, 659.25, 783.99, 1046.5];
      notes.forEach((fq, i) =>
        tone({ f0: fq, dur: 0.25, type: 'triangle', vol: 0.22, at: i * 0.08 }),
      );
      break;
    }
    case 'unlock':
      // 金光号角：G4 起，C5+E5 和声收束，尾缀高频金光
      tone({ f0: 392, dur: 0.18, type: 'sawtooth', vol: 0.22 });
      tone({ f0: 523.25, dur: 0.42, type: 'sawtooth', vol: 0.24, at: 0.16 });
      tone({ f0: 659.25, dur: 0.42, type: 'sawtooth', vol: 0.16, at: 0.16 });
      tone({ f0: 1568, dur: 0.3, type: 'sine', vol: 0.08, at: 0.3 });
      break;
    case 'shieldBreak':
      // 护盾碎裂：高频碎裂声 + 方波下坠
      noiseBurst({ dur: 0.25, f0: 3000, type: 'highpass', vol: 0.3 });
      tone({ f0: 880, f1: 220, dur: 0.3, type: 'square', vol: 0.14 });
      break;
    case 'revive':
      // 复活：温暖上行涌动
      tone({ f0: 220, f1: 440, dur: 0.6, type: 'sine', vol: 0.3 });
      tone({ f0: 330, f1: 660, dur: 0.5, type: 'sine', vol: 0.18, at: 0.1 });
      break;
    case 'combo': {
      // 清脆连击：3s 窗口内音调渐升
      const t = now();
      if (t - comboLast > 3000) comboChain = 0;
      comboLast = t;
      comboChain++;
      const k = 1 + Math.min(comboChain, 10) * 0.05;
      tone({ f0: 1900 * k, dur: 0.05, type: 'square', vol: 0.14 });
      tone({ f0: 2850 * k, dur: 0.05, type: 'sine', vol: 0.1, at: 0.03 });
      break;
    }
    case 'stun':
      // 眩晕：颤抖音
      wobbleTone(380, 0.45, 0.2);
      break;
  }
}

// -------------------------------------------------------------
// BGM：舒缓低音垫 + 稀疏暗色琶音（音量压低，循环）
// -------------------------------------------------------------
function startBgm(): void {
  if (!ctx || !master || bgm) return; // 幂等：重复 start 直接忽略
  if (ctx.state !== 'running') return;
  const c = ctx;

  const gain = c.createGain();
  gain.gain.setValueAtTime(0, c.currentTime);
  gain.gain.linearRampToValueAtTime(0.13, c.currentTime + 2.5); // 淡入，整体低音量
  const flt = c.createBiquadFilter();
  flt.type = 'lowpass';
  flt.frequency.value = 320;
  flt.Q.value = 0.5;
  flt.connect(gain);
  gain.connect(master);

  // 低音垫：A1 + E2 + 微失谐 A1（暗色、厚而不浊）
  const oscs: OscillatorNode[] = [];
  const padNotes: [number, OscillatorType, number][] = [
    [55, 'triangle', 0.5],
    [82.41, 'sine', 0.35],
    [55.4, 'sine', 0.3],
  ];
  for (const [fq, ty, v] of padNotes) {
    const o = c.createOscillator();
    o.type = ty;
    o.frequency.value = fq;
    const og = c.createGain();
    og.gain.value = v;
    o.connect(og);
    og.connect(flt);
    o.start();
    oscs.push(o);
  }

  // 稀疏琶音：A 小调五声低把位，随机跳过，长衰减
  const pluckNotes = [110, 130.81, 146.83, 164.81, 196]; // A2 C3 D3 E3 G3
  const pluck = (): void => {
    if (!ctx || !bgm) return;
    if (Math.random() < 0.3) return; // 稀疏感
    const fq = pluckNotes[Math.floor(Math.random() * pluckNotes.length)];
    const t0 = ctx.currentTime + 0.05;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = fq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(0.09, t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.6);
    o.connect(g);
    g.connect(gain);
    o.start(t0);
    o.stop(t0 + 1.7);
  };
  const timer = window.setInterval(pluck, 1900);

  bgm = { gain, oscs, timer };
}

function stopBgm(): void {
  if (!bgm) return; // 幂等：未播直接忽略
  const b = bgm;
  bgm = null;
  window.clearInterval(b.timer);
  if (ctx) {
    const t0 = ctx.currentTime;
    b.gain.gain.cancelScheduledValues(t0);
    b.gain.gain.setTargetAtTime(0, t0, 0.2); // 淡出
    window.setTimeout(() => {
      for (const o of b.oscs) {
        try {
          o.stop();
        } catch {
          /* 已停止则忽略 */
        }
      }
      b.gain.disconnect();
    }, 900);
  }
}

// -------------------------------------------------------------
// 对外契约
// -------------------------------------------------------------
function unlock(): void {
  if (!ctx) {
    try {
      const w = window as unknown as {
        AudioContext?: typeof AudioContext;
        webkitAudioContext?: typeof AudioContext;
      };
      const AC = w.AudioContext ?? w.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.9;
      master.connect(ctx.destination);
      noiseBuf = makeNoise(ctx);
    } catch {
      ctx = null;
      master = null;
      noiseBuf = null;
      return;
    }
  }
  if (ctx.state !== 'running') void ctx.resume().catch(() => undefined);
}

function setMuted(m: boolean): void {
  muted = m;
  try {
    localStorage.setItem(MUTE_KEY, m ? '1' : '0');
  } catch {
    /* 隐私模式等场景下静默失败 */
  }
  if (ctx && master) {
    master.gain.setTargetAtTime(m ? 0 : 0.9, ctx.currentTime, 0.05);
  }
}

export const audio = {
  unlock,
  play,
  startBgm,
  stopBgm,
  setMuted,
};
