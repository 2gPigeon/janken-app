const { useEffect, useMemo, useRef, useState } = React;

function randomId() {
  return "jkn-" + Math.random().toString(36).slice(2, 8);
}

function parseBool(v, def) {
  if (v === undefined) return def;
  if (v === "true") return true;
  if (v === "false") return false;
  return def;
}

function getPeerConfigFromLocation() {
  const params = new URLSearchParams(window.location.search);
  const server = params.get("server"); // 'cloud' | 'local'
  console.log(params);
  if (server === "cloud" || window.location.protocol === "https:") {
    return {
      host: "https://p2p-server-zf0x.onrender.com",
      secure: true,
      path: "/myapp",
    };
  }
  // default local (HTTP/file)
  return {
    host: params.get("host") || "localhost",
    port: Number(params.get("port") || 9000),
    secure: parseBool(params.get("secure"), false),
    path: params.get("path") || "/peerjs",
    debug: 2,
  };
}

function App() {
  const [myId, setMyId] = useState("");
  const [remoteId, setRemoteId] = useState("");
  const [status, setStatus] = useState("初期化中...");
  const [messages, setMessages] = useState([]);
  const [myChoice, setMyChoice] = useState(null); // 'rock' | 'paper' | 'scissors'
  const [theirChoice, setTheirChoice] = useState(null);
  const [result, setResult] = useState(null); // 'win' | 'lose' | 'draw'
  const [theirLocked, setTheirLocked] = useState(false);
  const [myRevealed, setMyRevealed] = useState(false);

  // Refs to avoid stale state inside PeerJS callbacks
  const myChoiceRef = useRef(null);
  const myRevealedRef = useRef(false);
  const theirLockedRef = useRef(false);

  function setMyChoiceState(v) { setMyChoice(v); myChoiceRef.current = v; }
  function setMyRevealedState(v) { setMyRevealed(v); myRevealedRef.current = v; }
  function setTheirLockedState(v) { setTheirLocked(v); theirLockedRef.current = v; }

  const peerRef = useRef(null);
  const connRef = useRef(null);

  const peerConfig = useMemo(() => getPeerConfigFromLocation(), []);
  const showLogs = useMemo(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const v = (params.get("debug") || "").toLowerCase();
      if (v === "1" || v === "true" || v === "yes") return true;
      if (location.protocol === "file:" || location.hostname === "localhost" || location.hostname === "127.0.0.1") return true;
    } catch {}
    return false;
  }, []);

  useEffect(() => {
    const id = randomId();
    const peer = new Peer(id, peerConfig);
    peerRef.current = peer;

    // Clipboard fallback polyfill for environments without navigator.clipboard
    try {
      if (!navigator.clipboard || !navigator.clipboard.writeText) {
        if (!navigator.clipboard) navigator.clipboard = {};
        navigator.clipboard.writeText = (text) => new Promise((resolve, reject) => {
          try {
            const ta = document.createElement("textarea");
            ta.value = String(text ?? "");
            ta.setAttribute("readonly", "");
            ta.style.position = "fixed";
            ta.style.opacity = "0";
            document.body.appendChild(ta);
            ta.focus();
            ta.select();
            const ok = document.execCommand("copy");
            document.body.removeChild(ta);
            ok ? resolve() : reject(new Error("execCommand failed"));
          } catch (e) { reject(e); }
        });
      }
    } catch {}

    const log = (m) => { if (showLogs) setMessages((prev) => [...prev, m]); };

    peer.on("open", (pid) => {
      setMyId(pid);
      setStatus("待機中（相手の接続を待っています）");
      log(`Peer open: ${pid}`);
    });

    peer.on("connection", (conn) => {
      if (connRef.current) {
        // Already connected; reject additional connections
        conn.close();
        return;
      }
      attachConnection(conn, true);
    });

    peer.on("error", (err) => {
      console.error(err);
      setStatus(`エラー: ${err?.type || err?.message}`);
      log(`Peer error: ${err?.type || err?.message}`);
    });

    return () => {
      try { connRef.current?.close(); } catch {}
      try { peer.destroy(); } catch {}
    };
  }, [peerConfig]);

  function attachConnection(conn, incoming = false) {
    connRef.current = conn;
    setStatus("接続済み");
    setMessages((prev) => [...prev, `Connected ${incoming ? "(incoming)" : "(outgoing)"} to ${conn.peer}`]);

    conn.on("open", () => {
      setStatus("接続済み（プレイできます）");
      conn.send({ type: "hello", from: myId });
    });
    conn.on("data", (data) => handleIncoming(data));
    conn.on("close", () => {
      setMessages((prev) => [...prev, "接続が切断されました"]);
      setStatus("切断");
      connRef.current = null;
    });
    conn.on("error", (err) => {
      setMessages((prev) => [...prev, `Conn error: ${err?.type || err?.message}`]);
    });
  }

  function connectToRemote() {
    if (!peerRef.current) return;
    if (connRef.current) {
      alert("すでに接続中です");
      return;
    }
    if (!remoteId) {
      alert("相手のIDを入力してください");
      return;
    }
    setStatus("接続中...");
    const conn = peerRef.current.connect(remoteId, { reliable: true });
    attachConnection(conn, false);
  }

  function handleIncoming(msg) {
    setMessages((prev) => [...prev, `RX: ${JSON.stringify(msg)}`]);
    if (!msg || typeof msg !== "object") return;

    if (msg.type === "hello") {
      // optional greeting
    }
    if (msg.type === "locked") {
      setTheirLockedState(true);
      if (myChoiceRef.current && !myRevealedRef.current) {
        // reveal now (and send legacy 'choice' for backward compatibility)
        send({ type: "reveal", value: myChoiceRef.current });
        send({ type: "choice", value: myChoiceRef.current });
        setMyRevealedState(true);
      }
    }
    if (msg.type === "reveal") {
      setTheirLockedState(true);
      setTheirChoice(msg.value);
      if (myChoiceRef.current && msg.value) setResult(judge(myChoiceRef.current, msg.value));
      if (myChoiceRef.current && !myRevealedRef.current) {
        send({ type: "reveal", value: myChoiceRef.current });
        send({ type: "choice", value: myChoiceRef.current });
        setMyRevealedState(true);
      }
    }
    // backward compatibility: treat legacy 'choice' as 'reveal'
    if (msg.type === "choice") {
      // legacy peer: treat as committed + revealed
      setTheirLockedState(true);
      setTheirChoice(msg.value);
      if (myChoiceRef.current && msg.value) setResult(judge(myChoiceRef.current, msg.value));
      if (myChoiceRef.current && !myRevealedRef.current) {
        send({ type: "reveal", value: myChoiceRef.current });
        send({ type: "choice", value: myChoiceRef.current });
        setMyRevealedState(true);
      }
    }
    if (msg.type === "reset") {
      resetRound(false);
    }
  }

  function send(obj) {
    const c = connRef.current;
    if (c && c.open) c.send(obj);
    if (showLogs) setMessages((prev) => [...prev, `TX: ${JSON.stringify(obj)}`]);
  }

  function play(choice) {
    if (!connRef.current?.open) {
      alert("まず相手に接続してください");
      return;
    }
    if (myChoiceRef.current) return; // already played
    setMyChoiceState(choice);
    // announce lock without revealing
    send({ type: "locked" });
    // if opponent already locked, reveal now (and legacy 'choice')
    if (theirLockedRef.current && !myRevealedRef.current) {
      send({ type: "reveal", value: choice });
      send({ type: "choice", value: choice });
      setMyRevealedState(true);
    }
  }

  function resetRound(notifyPeer = true) {
    setMyChoiceState(null);
    setTheirChoice(null);
    setResult(null);
    setTheirLockedState(false);
    setMyRevealedState(false);
    if (notifyPeer) send({ type: "reset" });
  }

  // derive result
  useEffect(() => {
    if (!myChoice || !theirChoice) return;
    const r = judge(myChoice, theirChoice);
    setResult(r);
  }, [myChoice, theirChoice]);

  function judge(a, b) {
    if (a === b) return "draw";
    const win =
      (a === "rock" && b === "scissors") ||
      (a === "scissors" && b === "paper") ||
      (a === "paper" && b === "rock");
    return win ? "win" : "lose";
  }

  function disconnect() {
    try { connRef.current?.close(); } catch {}
    connRef.current = null;
    setStatus("切断");
  }

  function copyId() {
    if (!myId) return;
    navigator.clipboard?.writeText(myId).then(() => {
      setMessages((prev) => [...prev, "IDをクリップボードにコピーしました"]);
    }).catch(() => {});
  }

  return (
    <div className="container">
      <h1>P2P じゃんけん</h1>

      <section className="card">
        <h2>接続</h2>
        <div className="row">
          <label>自分のID</label>
          <div className="idbox">
            <code>{myId || "..."}</code>
            <button onClick={copyId} disabled={!myId}>コピー</button>
          </div>
        </div>
        <div className="row">
          <label htmlFor="remote">相手のID</label>
          <input id="remote" value={remoteId} onChange={(e) => setRemoteId(e.target.value)} placeholder="例: jkn-abc123" />
          <button onClick={connectToRemote} disabled={!myId || !!connRef.current}>接続</button>
          <button onClick={disconnect} disabled={!connRef.current}>切断</button>
        </div>
        <p className="status">状態: {status}</p>
        <details>
          <summary>シグナリング設定</summary>
          <div className="hint">
            <p>
              HTTPS配下(GitHub Pagesなど)では混在コンテンツ回避のためデフォルトで
              PeerJSクラウド({"0.peerjs.com"})に接続します。
              ローカル確認では <code>ws://localhost:9000/peerjs</code> を利用します。
            </p>
            <p>
              上書き: <code>?server=cloud</code> または <code>?server=local</code>、
              さらに <code>host</code>/<code>port</code>/<code>path</code>/<code>secure</code> 指定可能。
            </p>
          </div>
        </details>
      </section>

      <section className="card">
        <h2>じゃんけん</h2>
        <div className="buttons">
          <button onClick={() => play("rock")} disabled={!connRef.current || !!myChoice}>グー</button>
          <button onClick={() => play("paper")} disabled={!connRef.current || !!myChoice}>パー</button>
          <button onClick={() => play("scissors")} disabled={!connRef.current || !!myChoice}>チョキ</button>
        </div>

        <div className="board">
          <div>
            <h3>自分</h3>
            <Choice value={myChoice} />
          </div>
          <div>
            <h3>相手</h3>
            <Choice value={theirChoice} />
          </div>
        </div>

        <div className="result">
          {result === "win" && <strong className="win">あなたの勝ち！</strong>}
          {result === "lose" && <strong className="lose">あなたの負け…</strong>}
          {result === "draw" && <strong className="draw">あいこ</strong>}
        </div>

        <div>
          <button onClick={() => resetRound(true)} disabled={!connRef.current}>もう一度</button>
        </div>
      </section>

      <section className="card">
        <h2>ログ</h2>
        <div className="log">
          {messages.map((m, i) => (
            <div key={i}>{m}</div>
          ))}
        </div>
      </section>
    </div>
  );
}

function Choice({ value }) {
  if (!value) return <span className="muted">未選択</span>;
  const jp = value === "rock" ? "グー" : value === "paper" ? "パー" : "チョキ";
  return <span className={`choice ${value}`}>{jp}</span>;
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<App />);
