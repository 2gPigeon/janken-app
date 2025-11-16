## P2P リアルタイムじゃんけん (PeerJS + React)

ブラウザ上でPeerJSを使ったP2Pデータ通信により、相手とリアルタイムにじゃんけんを行う最小構成のアプリです。

- フロントエンド: React(UMD) + Babel(ブラウザ変換) の純静的構成
- P2P: PeerJS(DataConnection)
- ローカル動作: ローカルPeerJSサーバーに接続して複数タブで動作確認
- デプロイ: GitHub Pagesに静的ファイルを配置するだけ

---

### 1. 構成

- `index.html` — 画面の土台。React/PeerJS/BabelをCDNから読み込み
- `app.jsx` — じゃんけんのReact実装とPeerJSの接続処理
- `styles.css` — 簡易スタイル

ローカル(HTTP or file)時は既定でローカルPeerJSサーバー(`ws://localhost:9000/peerjs`)に接続します。
HTTPS配下(例: GitHub Pages)では混在コンテンツを避けるため、既定でPeerJSクラウド(`wss://0.peerjs.com/`)へ接続します。

クエリパラメータで上書き可能:

- `?server=cloud` or `?server=local`
- 任意指定: `host`, `port`, `path`, `secure` 例: `?host=localhost&port=9000&path=/peerjs&secure=false`

---

### 2. ローカルでの確認手順

前提: Node.js がインストール済み

1) PeerJS シグナリングサーバーを起動

```
npx peerjs --port 9000 --path /peerjs
```

2) フロントエンドを開く

- もっとも簡単: `index.html` をブラウザで直接開く (file://)
- もしくはローカルHTTPサーバーを使う (任意)

  - Pythonがあれば: `python -m http.server 5173` のあと http://localhost:5173 を開く
  - Nodeがあれば: `npx http-server -p 5173` のあと http://localhost:5173 を開く

3) 複数タブで動作確認

- タブAで表示された「自分のID」をコピー
- タブBで「相手のID」に貼り付けて「接続」
- 両者の接続が確立したら、じゃんけんの手を選択

---

### 3. GitHub Pages へのデプロイ

このリポジトリはビルド不要の静的構成です。`index.html` などをそのまま公開すれば動作します。

オプションA: デフォルトブランチ直下を公開

1) GitHub のリポジトリ設定 → Pages
2) Source: "Deploy from a branch"
3) Branch: `main` / フォルダ: `/ (root)` を選択

オプションB: `docs/` フォルダを公開

1) ルートの3ファイル(`index.html`, `app.jsx`, `styles.css`, `README.md`)を `docs/` に移動
2) Pagesの公開元を `main` / `docs/` に設定

注意: GitHub PagesはHTTPS配信のため、ローカルの`ws://localhost:9000`への接続は混在コンテンツでブロックされます。
公開環境では既定で `wss://0.peerjs.com/` に接続します。自前サーバーを使う場合はTLS終端付き(`wss://`)で公開してください。

---

### 4. よくあるトラブル

- つながらない / すぐ切断される
  - ローカル確認時: `npx peerjs --port 9000 --path /peerjs` が起動中か確認
  - ファイアウォール/プロキシで `localhost:9000` がブロックされていないか
  - 相手のIDの入力ミスがないか

- GitHub Pages上でローカルサーバーに接続できない
  - HTTPS→WS (非TLS) は混在コンテンツでブロックされます。クラウド(0.peerjs.com)を使うか、自前で `wss://` を用意してください。

---

### 5. 追加メモ

- 依存はすべてCDNから配信されるため `npm install` は不要です
- ビルド不要なので、静的ホスティングにそのままアップロードでOKです

