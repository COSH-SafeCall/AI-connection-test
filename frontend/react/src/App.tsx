import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from 'react';
import { LiveSession } from './live';

type Entry = { id: number; role: 'user' | 'assistant'; text: string };

export default function App() {
  const [status, setStatus] = useState<'idle' | 'connecting' | 'connected'>('idle');
  const [muted, setMuted] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [level, setLevel] = useState(0);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [model, setModel] = useState('');
  const [entries, setEntries] = useState<Entry[]>([]);
  const [text, setText] = useState('');
  const [seconds, setSeconds] = useState(0);
  const session = useRef<LiveSession | null>(null);
  const activeEntries = useRef<Partial<Record<Entry['role'], number>>>({});
  const nextId = useRef(0);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => () => { session.current?.stop(); }, []);
  useEffect(() => {
    if (status !== 'connected') return;
    const started = Date.now();
    const timer = setInterval(() => setSeconds(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [status]);
  useEffect(() => { end.current?.scrollIntoView({ block: 'nearest' }); }, [entries]);

  function transcript(role: Entry['role'], chunk: string) {
    let id = activeEntries.current[role];
    if (id === undefined) { id = nextId.current++; activeEntries.current[role] = id; }
    const entryId = id;
    setEntries((previous) => previous.some((entry) => entry.id === entryId)
      ? previous.map((entry) => entry.id === entryId ? { ...entry, text: entry.text + chunk } : entry)
      : [...previous, { id: entryId, role, text: chunk }]);
  }

  function start() {
    if (session.current) return;
    setError(''); setNotice(''); setMuted(false); setSeconds(0); setModel('');
    activeEntries.current = {};
    setStatus('connecting');
    const current = new LiveSession({
      connected: (name) => { setModel(name); setStatus('connected'); },
      speaking: setSpeaking, level: setLevel, transcript,
      turnEnded: () => { activeEntries.current = {}; },
      notice: setNotice,
      closed: (message) => {
        session.current = null; setStatus('idle'); setLevel(0); setMuted(false);
        setNotice(''); if (message) setError(message);
      },
    });
    session.current = current;
    void current.start();
  }

  function stop() {
    session.current?.stop(); session.current = null;
    setStatus('idle'); setLevel(0); setMuted(false); setNotice('');
    activeEntries.current = {};
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const value = text.trim();
    if (!value || !session.current?.sendText(value)) return;
    setEntries((previous) => [...previous, { id: nextId.current++, role: 'user', text: value }]);
    setText('');
  }

  const connected = status === 'connected';
  const label = status === 'connecting' ? '연결 중' : !connected ? '대화 준비 완료' : speaking ? 'Gemini가 말하고 있어요' : muted ? '마이크가 꺼져 있어요' : '이야기를 듣고 있어요';

  return <div className="app">
    <header><a className="brand" href="./"><span className="brand-icon">S</span>SafeCall<span className="brand-divider">/</span><span className="brand-sub">Live</span></a><span className="powered"><span className="spark">✦</span> Powered by Gemini</span></header>
    <main>
      <div className="intro"><span className="eyebrow">A LITTLE CONVERSATION, ANYTIME</span><h1>지금, 편하게 이야기해요.</h1><p>오늘 있었던 일부터 문득 떠오른 생각까지. Gemini가 함께할게요.</p></div>
      <div className="workspace">
        <section className="call-panel" aria-label="음성 대화">
          <div className="panel-top"><span className={`badge ${connected ? 'online' : ''}`}><i />{connected ? 'LIVE' : 'VOICE CHAT'}</span><span className="timer">{String(Math.floor(seconds / 60)).padStart(2, '0')}:{String(seconds % 60).padStart(2, '0')}</span></div>
          <div className={`orb-area ${speaking ? 'speaking' : ''}`} style={{ '--level': level } as CSSProperties}><div className="orb-ring" /><div className="orb"><span>✦</span></div></div>
          <h2 role="status">{label}</h2><p className="call-description">{status === 'connecting' ? '마이크 권한을 허용하면 곧 연결됩니다.' : connected ? '자연스럽게 말해 주세요. 잠시 멈추면 답해 드려요.' : '아래 버튼을 누르면 음성 대화를 시작해요.'}</p>
          <div className={`wave ${connected && !muted ? 'active' : ''}`} aria-hidden="true">{Array.from({ length: 25 }, (_, i) => <span key={i} style={{ height: `${8 + (Math.sin(i * 1.8) + 1) * (speaking ? 13 : level * 26)}px` }} />)}</div>
          <div className="controls">{status === 'idle' ? <button className="primary" onClick={start}>◉ <span>대화 시작하기</span></button> : <><button className="secondary" disabled={!connected} aria-pressed={muted} onClick={() => { session.current?.setMuted(!muted); setMuted(!muted); }}>{muted ? '마이크 켜기' : '마이크 끄기'}</button><button className="danger" onClick={stop}>{connected ? '대화 종료' : '연결 취소'}</button></>}</div>
          <p className="helper">{connected ? '답변 중에도 말을 걸어 대화를 이어갈 수 있어요.' : '마이크 사용 권한이 필요해요.'}</p>
          {error && <div className="alert" role="alert">{error}</div>}{notice && <div className="notice" role="status">{notice}</div>}
        </section>
        <section className="transcript-panel" aria-label="실시간 대화 기록"><div className="transcript-heading"><div><h2>대화 기록</h2><p>우리의 이야기가 이곳에 담겨요.</p></div><button className="text-button" disabled={status !== 'idle' || !entries.length} onClick={() => setEntries([])}>지우기</button></div>
          <div className="messages" role="log" aria-live="polite" aria-relevant="additions text">{!entries.length ? <div className="empty"><span>☏</span><h3>첫마디를 건네 보세요</h3><p>“오늘 하루 어땠는지 이야기하고 싶어.”<br />음성과 함께 대화 내용도 실시간으로 표시돼요.</p></div> : entries.map((entry) => <article className={`message ${entry.role}`} key={entry.id}><span className="message-author">{entry.role === 'user' ? '나' : '✦ Gemini'}</span><p>{entry.text}</p></article>)}<div ref={end} /></div>
          <form onSubmit={submit}><input aria-label="Gemini에게 메시지 보내기" placeholder={connected ? '텍스트로도 이야기할 수 있어요' : '대화를 시작한 뒤 메시지를 보내세요'} value={text} onChange={(event) => setText(event.target.value)} disabled={!connected} maxLength={4000} /><button type="submit" aria-label="메시지 전송" disabled={!connected || !text.trim()}>↑</button></form>
        </section>
      </div>
      <footer><span><i /> 음성은 대화 중 Gemini로 전송됩니다.</span><span>{model ? model.replace('models/', '') : 'Gemini Live · 실시간 음성 대화'}</span></footer>
    </main>
  </div>;
}
