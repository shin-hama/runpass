# CLAUDE.md — ランパス MVP

## プロジェクト概要

**ランパス**は、ランニング中のすれ違い体験を記録するスマートフォンアプリ。
ユーザーが走っている間、バックグラウンドでGPSを記録し、近くにいた他のランナーを
走行終了後にまとめて通知する。Nintendo DSの「すれ違い通信」をスマホのランニングで再現する。

**ターゲット：** ゆるく健康・交流目的で走る都市型ランナー（20〜40代）  
**コアバリュー：** 走るだけで、知らなかった「近所のランナー」と出会える  
**MVP目標：** すれ違い検出の核心ループを最短で動かすこと。UIの美しさより動作確認を優先する。

---

## 技術スタック

| レイヤー | 採用技術 | 理由 |
|---|---|---|
| モバイルアプリ | Expo (React Native) + TypeScript | バックグラウンドGPS取得が必要。Expoなら `expo-location` で iOS/Android 両対応 |
| 認証 | Firebase Auth（匿名認証 → 後からメール/Google連携） | 初回摩擦を最小化 |
| DB | Firestore | リアルタイム更新不要。読み書きシンプル |
| バックエンドロジック | Firebase Cloud Functions (Node.js / TypeScript) | すれ違い判定はサーバーサイドで実行 |
| 通知 | Expo Push Notifications + Firebase Cloud Messaging | 走行終了後に「今日のすれ違い」通知 |

**使用パッケージ（主要）**
```
expo@latest
expo-location
expo-task-manager
expo-notifications
firebase (client SDK)
firebase-functions (server)
```

---

## MVP スコープ（必ずやること / やらないこと）

### ✅ MVP に含める

1. 匿名ユーザー登録（ニックネームのみ）
2. ランニング開始・終了画面（距離・ペースのリアルタイム表示）
3. バックグラウンドGPS記録（15秒ごとにFirestoreへ位置情報を保存）
4. 走行終了トリガーでCloud Functionがすれ違い判定を実行
5. 「今日のすれ違い」一覧画面（匿名表示）
6. ランナーカード画面（すれ違い回数・ペース帯・エリア）
7. ローカルPush通知（走行終了時）

### ❌ MVP に含めない（後回し）

- ユーザー間のメッセージ機能
- ラン仲間申請・承認フロー
- マップ画面（ランナー密度可視化）
- プレミアム機能・課金
- SNSログイン
- 写真・プロフィール画像
- ソーシャルフィード

---

## ディレクトリ構造

```
runpass/
├── app/                        # Expo Router (ファイルベースルーティング)
│   ├── (tabs)/
│   │   ├── index.tsx           # ホーム（今日のすれ違い一覧）
│   │   ├── run.tsx             # ランニング画面
│   │   └── profile.tsx         # 自分のカード
│   ├── encounter/[id].tsx      # ランナーカード詳細
│   └── _layout.tsx
├── components/
│   ├── EncounterCard.tsx        # すれ違いリストアイテム
│   ├── RunStats.tsx             # ペース・距離表示
│   └── RunnerCard.tsx           # ランナーカード（詳細）
├── hooks/
│   ├── useRunTracking.ts        # GPS記録ロジック
│   └── useEncounters.ts         # すれ違いデータ取得
├── lib/
│   ├── firebase.ts              # Firebase初期化
│   ├── geo.ts                   # Haversine距離計算
│   └── constants.ts             # 設定値（半径・間隔など）
├── functions/                   # Firebase Cloud Functions
│   └── src/
│       ├── index.ts
│       └── detectEncounters.ts  # すれ違い判定ロジック
├── types/
│   └── index.ts                 # 共通型定義
└── CLAUDE.md                    # このファイル
```

---

## データモデル（Firestore）

### `users/{uid}`
```typescript
interface User {
  uid: string;
  nickname: string;      // "ランナー #5A92B1"（表示用）
  anonymousId: string;   // "5A92B1"（検索・照合用
  createdAt: Timestamp;
  totalRuns: number;
  totalDistance: number;     // km
}
```

### `runs/{runId}`
```typescript
interface Run {
  runId: string;
  userId: string;
  startedAt: Timestamp;
  endedAt: Timestamp | null;
  distanceKm: number;
  avgPaceSecPerKm: number;
  status: 'active' | 'completed';
  processed: boolean;        // すれ違い判定済みフラグ
}
```

### `runs/{runId}/locations/{autoId}`
```typescript
interface LocationPoint {
  lat: number;
  lng: number;
  recordedAt: Timestamp;
}
```
> Firestoreルール: 自分のrunIdのサブコレクションのみ書き込み可能。
> 読み取りはCloud Functionsからのみ（Admin SDK）。

### `encounters/{encounterId}`
```typescript
interface Encounter {
  encounterId: string;
  userId: string;            // このすれ違いを「見る」ユーザー
  otherNickname: string;     // 相手のニックネーム（例: "ランナー #5A92B1"）
  otherAnonymousId: string;  // 相手の表示ID（例: "5A92B1"）
  encounteredAt: Timestamp;  // すれ違い発生時刻
  runId: string;             // 自分のrunId
  otherRunId: string;        // 相手のrunId
  locationLat: number;       // すれ違い地点（大まかな位置）
  locationLng: number;
  otherPaceSecPerKm: number;
  count: number;             // 過去の累計すれ違い回数（この相手と）
  notified: boolean;
}
```

### `encounterSummaries/{uid}_{otherUid}` （集計用）
```typescript
interface EncounterSummary {
  userId: string;
  otherUserId: string;
  otherAnonymousId: string;
  totalCount: number;
  lastEncounteredAt: Timestamp;
  commonArea: string;        // 最もよくすれ違う地名（簡易逆ジオコード）
}
```

---

## すれ違い判定ロジック（Cloud Functions）

**トリガー：** `runs/{runId}` ドキュメントの `status` が `'completed'` に更新されたとき

```
detectEncounters.ts の処理手順:

1. 完了したrunのlocationサブコレクションを全取得
2. runの時間帯（startedAt 〜 endedAt）にステータスが active または completed の
   他ユーザーのrunを検索
3. 各他ユーザーのlocation点を取得
4. 自分の各location点 × 相手の各location点 でHaversine距離を計算
5. 距離 < PROXIMITY_METERS (50m) かつ 時刻差 < TIME_WINDOW_SEC (30秒) であれば「すれ違い」
6. 同一runIdペアで複数回検出された場合は1回にまとめる（dedup）
7. encounters コレクションに書き込み（userId/otherUserId の両方向）
8. encounterSummaries を更新（累計カウントをインクリメント）
9. Expo Push通知を送信（未通知ユーザーに）
```

**定数（lib/constants.ts）**
```typescript
export const PROXIMITY_METERS = 50;      // すれ違いとみなす距離
export const TIME_WINDOW_SEC = 30;       // すれ違いとみなす時刻差
export const GPS_INTERVAL_SEC = 15;      // GPS記録間隔
export const MIN_RUN_DURATION_SEC = 120; // 2分未満のrunは判定しない
```

**Haversine距離計算（lib/geo.ts）**
```typescript
// 2点間の距離をメートルで返す
export function haversineMeters(
  lat1: number, lng1: number,
  lat2: number, lng2: number
): number { ... }
```

---

## Firestoreセキュリティルール（要点）

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // ユーザー自身のプロフィールのみ読み書き
    match /users/{uid} {
      allow read, write: if request.auth.uid == uid;
    }
    // run の書き込みは本人のみ、読み取りは Cloud Functions から (admin)
    match /runs/{runId} {
      allow create: if request.auth.uid == request.resource.data.userId;
      allow update: if request.auth.uid == resource.data.userId;
      allow read: if request.auth.uid == resource.data.userId;
    }
    match /runs/{runId}/locations/{locId} {
      allow write: if request.auth.uid == get(/databases/$(database)/documents/runs/$(runId)).data.userId;
      allow read: if false; // Cloud Functions (Admin SDK) からのみ
    }
    // すれ違いは自分のものだけ読める
    match /encounters/{encId} {
      allow read: if request.auth.uid == resource.data.userId;
      allow write: if false; // Cloud Functions のみ
    }
    match /encounterSummaries/{docId} {
      allow read: if request.auth.uid == resource.data.userId;
      allow write: if false;
    }
  }
}
```

---

## 画面一覧と仕様

### 画面1: ホーム / 今日のすれ違い一覧 `(tabs)/index.tsx`
- Firestoreの `encounters` コレクションを `userId == 自分` でクエリ（直近7日間）
- 各アイテム: 匿名ID・ペース帯・エリア・累計すれ違い回数
- タップでランナーカード詳細に遷移

### 画面2: ランニング画面 `(tabs)/run.tsx`
**停止状態**
- 「ランを開始」ボタン

**走行中状態**
- 経過時間（タイマー）
- 現在距離（km）・現在ペース（/km）のリアルタイム表示
- 「ランを終了」ボタン

**画面遷移フロー**
```
開始ボタンタップ
  → Firebase Auth で匿名UID確認
  → Firestore に run ドキュメント作成（status: 'active'）
  → expo-task-manager でバックグラウンドGPSタスク登録
  → 走行中UIへ

終了ボタンタップ
  → バックグラウンドタスク停止
  → run ドキュメントを status: 'completed' に更新
  → Cloud Function が自動起動（Firestoreトリガー）
  → 「集計中...」スナックバーを表示
  → ホーム画面に戻る
```

### 画面3: プロフィール `(tabs)/profile.tsx`
- 自分のニックネーム
- 累計ラン数・累計距離
- 総すれ違い人数

### 画面4: ランナーカード詳細 `encounter/[id].tsx`
- 匿名ID・累計すれ違い回数
- ペース帯（例: 「4:00〜5:00/km」）
- よくすれ違うエリア
- 最後にすれ違った日時
- （MVP後）スタンプ送る・ラン仲間申請

---

## バックグラウンドGPS実装（重要）

```typescript
// hooks/useRunTracking.ts のコア実装方針

import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';

const LOCATION_TASK = 'runpass-location-task';

// タスク定義（コンポーネント外・モジュールトップレベルに書くこと）
TaskManager.defineTask(LOCATION_TASK, async ({ data, error }) => {
  if (error) return;
  const { locations } = data as { locations: Location.LocationObject[] };
  // Firestoreのlocationサブコレクションに書き込む
  // 注意: バックグラウンドでFirebase Auth tokenが必要。
  //       匿名UIDをAsyncStorageに保存しておくこと。
});

// 開始
async function startTracking(runId: string) {
  await Location.requestBackgroundPermissionsAsync();
  await Location.startLocationUpdatesAsync(LOCATION_TASK, {
    accuracy: Location.Accuracy.Balanced,  // バッテリーとのトレードオフ
    timeInterval: 15_000,  // 15秒
    distanceInterval: 20,  // または20m移動するたび（どちらか早い方）
    showsBackgroundLocationIndicator: true, // iOS必須
    foregroundService: {                    // Android必須
      notificationTitle: 'ランパス 記録中',
      notificationBody: '走行を記録しています',
    },
  });
}
```

以下の点に注意:

> バックグラウンドでネットワークが切れた場合、その間のlocation点が消えます。Firestoreクライアントのオフラインキャッシュは書き込みをキューイングしてくれますが、プロセスが強制終了されると失われます。MVPでもAsyncStorageへのローカルバッファ＋再送は入れておくべきかと思います。

**iOS/Androidの権限設定（app.json / app.config.ts）**
```json
{
  "ios": {
    "infoPlist": {
      "NSLocationAlwaysAndWhenInUseUsageDescription": "ランニング中のすれ違いを記録するために位置情報を使用します",
      "NSLocationWhenInUseUsageDescription": "ランニング中のすれ違いを記録するために位置情報を使用します",
      "UIBackgroundModes": ["location"]
    }
  },
  "android": {
    "permissions": [
      "ACCESS_COARSE_LOCATION",
      "ACCESS_FINE_LOCATION",
      "ACCESS_BACKGROUND_LOCATION",
      "FOREGROUND_SERVICE"
    ]
  }
}
```

---

## 実装タスク順（Claude Code への指示順）

以下を**上から順番に**実装する。各セッションで1〜2タスクを完成させること。
前のタスクが動作確認できてから次に進む。

---

### Task 1: プロジェクトセットアップ

```
以下を実行してください:

1. `npx create-expo-app runpass --template blank-typescript` でプロジェクト作成
2. Expo Routerをセットアップ (expo install expo-router)
3. 必要パッケージをインストール:
   - expo-location
   - expo-task-manager
   - expo-notifications
   - firebase
   - @react-native-async-storage/async-storage
4. lib/firebase.ts を作成（Firebase初期化。credentialはenv経由）
5. types/index.ts に User, Run, LocationPoint, Encounter, EncounterSummary の型を定義
6. lib/constants.ts に PROXIMITY_METERS=50, TIME_WINDOW_SEC=30 等を定義
7. lib/geo.ts に haversineMeters 関数を実装してテスト
8. app/(tabs)/_layout.tsx でタブナビゲーション骨格を作成（ホーム・ラン・プロフィール）
```

---

### Task 2: Firebase Auth + ユーザー登録

```
以下を実装してください:

1. Firebase匿名認証でサインイン
2. 初回起動時にnicknameを生成（"ランナー #" + ランダム6桁英数字）
3. users/{uid} にユーザードキュメントを作成
4. UIDをAsyncStorageに保存（バックグラウンドタスクからも参照できるように）
5. app/(tabs)/profile.tsx にニックネームと累計統計の表示（まずは仮データでOK）
6. Firestoreのセキュリティルールを設定（CLAUDE.mdの「セキュリティルール」節を参照）
```

---

### Task 3: ランニング画面 + GPS記録

```
以下を実装してください:

1. app/(tabs)/run.tsx を実装
   - 「ランを開始」「ランを終了」ボタン
   - 走行中: 経過時間（setInterval 1秒更新）・距離（km）・ペース（/km）表示
2. hooks/useRunTracking.ts を実装
   - startRun(): Firestoreにrunドキュメント作成（status: 'active'）
   - stopRun(): status を 'completed' に更新
3. LOCATION_TASKを定義（モジュールトップレベル）
   - 位置情報を runs/{runId}/locations/{autoId} に書き込む
   - バックグラウンドでもUIDを参照できるようAsyncStorageから取得
4. startTracking() / stopTracking() を実装
5. app.json/app.config.ts に権限設定を追加（CLAUDE.mdの「権限設定」節を参照）

確認方法: 実機またはシミュレータでランを開始し、Firestoreコンソールで
locations サブコレクションにデータが入っていることを確認する。
```

---

### Task 4: Cloud Functions — すれ違い判定

> 1. すれ違い判定のO(n×m)問題は想定より早く顕在化する可能性がある
> CLAUDE.mdでは「MVP段階では問題なし」としていますが、1ランあたりのlocationが「15秒ごと・1時間走＝240点」、同時間帯のランナーが20人いれば240×240×20 = 約115万回の距離計算になります。Cloud Functionsのタイムアウト（デフォルト60秒）に引っかかるリスクがあります。
> 対策として、判定前に時間帯でのバケツ絞り込み（同じ15秒スロットの点だけ比較）を入れておくと計算量がかなり落とせます。GeoHashへの移行は後でも、時間軸のフィルタは最初から入れておくことをお勧めします。

上記レビューへの対応を含め、以下のタスクを実装してください。

```
1. functions/ ディレクトリをセットアップ（firebase init functions --typescript）
2. functions/src/index.ts で Firestore トリガーを定義:
   - onDocumentUpdated('runs/{runId}') で status が 'completed' になったときに発火
3. functions/src/detectEncounters.ts を実装:

   処理フロー（CLAUDE.mdの「すれ違い判定ロジック」節を参照）:
   a. 完了runのlocationサブコレクションを全取得
   b. 同時間帯の他ユーザーのrunを検索（startedAt/endedAt でフィルタ）
   c. 各相手のlocation点を取得
   d. haversineMeters で距離計算、PROXIMITY_METERS未満かつ時刻差TIME_WINDOW_SEC未満を「すれ違い」とする
   e. runIdペアでdedup（同一runとのすれ違いは1回）
   f. encounters に双方向で書き込み（userId側・otherUserId側）
   g. encounterSummaries を upsert（累計カウント更新）

4. 判定ロジックのユニットテストを functions/src/__tests__/detectEncounters.test.ts に書く
   （haversineメートルの境界値、dedup動作を必ずテストすること）

確認方法: firebase emulators:start でローカル実行し、
Firestoreエミュレータに2ユーザーのrun/locationデータを手動投入して
encountersが生成されることを確認する。
```

---

### Task 5: 今日のすれ違い一覧画面

```
以下を実装してください:

1. hooks/useEncounters.ts を実装
   - encounters コレクションを userId == 自分のUID でクエリ
   - 直近7日間、encounteredAt降順
   - encounterSummaries から累計カウントをマージ
2. components/EncounterCard.tsx を実装
   - 匿名ID（"ランナー #5A92B1"形式）
   - ペース帯（avgPaceSecPerKm から "4:00〜5:00/km" に変換）
   - すれ違い地点の大まかな地名（今はlat/lngをそのまま表示でOK）
   - 累計すれ違い回数バッジ（3回以上なら強調表示）
3. app/(tabs)/index.tsx でリスト表示
   - データなし状態: 「まだすれ違いがありません。走ってみましょう！」
   - ローディング状態を適切に処理
4. EncounterCard タップで encounter/[id].tsx へ遷移（encounterId をパラメータで渡す）
```

---

### Task 6: ランナーカード詳細画面

```
以下を実装してください:

1. app/encounter/[id].tsx を実装
   - encounterId からencounterSummaryを取得
   - ランナーカードUIを表示（components/RunnerCard.tsx）
2. components/RunnerCard.tsx を実装
   - 匿名ID・累計すれ違い回数
   - ペース帯（"早め / ふつう / ゆっくり" の3段階でよい）
   - よくすれ違うエリア（今はlat/lngから都道府県名だけでOK）
   - 最後にすれ違った日時（"3日前" のような相対表示）
   - 「スタンプを送る」ボタン（MVP ではモックでOK。タップで「準備中」Toast）
```

---

### Task 7: Push通知

```
以下を実装してください:

1. expo-notifications のセットアップ
2. ユーザーのExpoPushTokenをFirestore users/{uid}.expoPushToken に保存
3. Cloud Functions の detectEncounters.ts 末尾で:
   - Expo Push API にリクエスト（HTTPで直接送信）
   - メッセージ: "今日 {count}人のランナーとすれ違いました！"
4. 通知タップでホーム画面を開くディープリンクを設定

注意: Expo Push Notifications はサーバーサイドから
https://exp.host/--/api/v2/push/send にPOSTする。
firebase-admin のMessagingは使わない（Expoのラッパーを使う）。
```

---

### Task 8: 最終調整・動作確認

```
以下を確認・修正してください:

1. 実機（iOS + Android 両方）でのエンドツーエンド動作確認:
   - 2台の端末でランを開始 → 近い場所で同時に数分走る → 終了 → すれ違い通知が来るか
2. エラーハンドリングの確認:
   - 位置情報権限を拒否した場合の案内UI
   - オフライン時の挙動（Firestoreのオフラインキャッシュ）
3. バッテリー消費の確認（30分走行でのバッテリー減少量を記録）
4. Firestoreのセキュリティルールが意図通り機能しているかテスト
5. README.md を作成（セットアップ方法・環境変数一覧）
```

---

## 環境変数

`.env.local` に以下を設定（Gitにコミットしないこと）:

```
EXPO_PUBLIC_FIREBASE_API_KEY=
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=
EXPO_PUBLIC_FIREBASE_PROJECT_ID=
EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=
EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
EXPO_PUBLIC_FIREBASE_APP_ID=
```

---

## 既知の技術的注意事項

### iOSのバックグラウンド制約
- `UIBackgroundModes: ["location"]` を `app.json` に設定しないと、バックグラウンドでGPS取得が止まる
- Expo Go ではバックグラウンドGPSが動作しない。**必ず Development Build を使うこと**
  ```
  npx expo run:ios   または   eas build --profile development
  ```

### FirestoreでのAdmin SDK使用
- Cloud Functions からは Firebase Admin SDK を使う（セキュリティルールをバイパスできる）
- クライアントSDKと混同しないこと

### すれ違い判定のスケーラビリティ（MVP後の課題）
- 現実装はナイーブなO(n×m)の総当たり計算
- ユーザーが増えたらGeoHashベースのクエリに移行する
- MVP段階では問題なし（同時間帯のアクティブランナーはそこまで多くない）

### Androidのフォアグラウンドサービス
- Android 8以降、バックグラウンド位置情報はフォアグラウンドサービス通知が必要
- `expo-location` の `foregroundService` オプションで自動的に処理される

---

## 完成の定義（MVP Done基準）

- [ ] 2台の実機で同時にランを開始・終了できる
- [ ] 走行中に locations サブコレクションにデータが蓄積されている
- [ ] 走行終了後、Cloud Functionが自動起動して encounters が生成される
- [ ] 今日のすれ違い一覧がホーム画面に表示される
- [ ] ランナーカード詳細が開ける
- [ ] Push通知が届く
- [ ] iOSとAndroidの両方で動作する
