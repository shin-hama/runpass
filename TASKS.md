# ランパス MVP — 実装タスク一覧

以下を**上から順番に**実装する。各セッションで1〜2タスクを完成させること。
前のタスクが動作確認できてから次に進む。

---

## Task 1: プロジェクトセットアップ ✅

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

---

## Task 2: Firebase Auth + ユーザー登録 ✅

1. Firebase匿名認証でサインイン
2. 初回起動時にnicknameを生成（"ランナー #" + ランダム6桁英数字）
3. users/{uid} にユーザードキュメントを作成
4. UIDをAsyncStorageに保存（バックグラウンドタスクからも参照できるように）
5. app/(tabs)/profile.tsx にニックネームと累計統計の表示（まずは仮データでOK）
6. Firestoreのセキュリティルールを設定

---

## Task 3: ランニング画面 + GPS記録 ✅

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
5. app.json/app.config.ts に権限設定を追加

確認方法: 実機またはシミュレータでランを開始し、Firestoreコンソールで
locations サブコレクションにデータが入っていることを確認する。

---

## Task 4: Cloud Functions — すれ違い判定 ✅

> 時間スロット最適化（15秒バケツ絞り込み）を実装済み。13テスト合格。

1. functions/ ディレクトリをセットアップ（firebase init functions --typescript）
2. functions/src/index.ts で Firestore トリガーを定義:
   - onDocumentUpdated('runs/{runId}') で status が 'completed' になったときに発火
3. functions/src/detectEncounters.ts を実装:
   - 完了runのlocationサブコレクションを全取得
   - 同時間帯の他ユーザーのrunを検索（startedAt/endedAt でフィルタ）
   - 各相手のlocation点を取得
   - haversineMeters で距離計算、PROXIMITY_METERS未満かつ時刻差TIME_WINDOW_SEC未満を「すれ違い」とする
   - runIdペアでdedup（同一runとのすれ違いは1回）
   - encounters に双方向で書き込み（userId側・otherUserId側）
   - encounterSummaries を upsert（累計カウント更新）
4. 判定ロジックのユニットテストを functions/src/__tests__/detectEncounters.test.ts に記述

確認方法: firebase emulators:start でローカル実行し、
Firestoreエミュレータに2ユーザーのrun/locationデータを手動投入して
encountersが生成されることを確認する。

---

## Task 5: 今日のすれ違い一覧画面 ✅

1. hooks/useEncounters.ts を実装
   - encounters コレクションを userId == 自分のUID でクエリ
   - 直近7日間、encounteredAt降順
   - encounterSummaries から累計カウントをマージ
2. components/EncounterCard.tsx を実装
   - 匿名ID（"ランナー #5A92B1"形式）
   - ペース帯（avgPaceSecPerKm から "4:00〜5:00/km" に変換）
   - すれ違い地点の大まかな地名（lat/lngをそのまま表示でOK）
   - 累計すれ違い回数バッジ（3回以上なら強調表示）
3. app/(tabs)/index.tsx でリスト表示
   - データなし状態: 「まだすれ違いがありません。走ってみましょう！」
   - ローディング状態を適切に処理
4. EncounterCard タップで encounter/[id].tsx へ遷移（encounterId をパラメータで渡す）

---

## Task 6: ランナーカード詳細画面 ✅

1. app/encounter/[id].tsx を実装
   - encounterId からencounterSummaryを取得
   - ランナーカードUIを表示（components/RunnerCard.tsx）
2. components/RunnerCard.tsx を実装
   - 匿名ID・累計すれ違い回数
   - ペース帯（"早め / ふつう / ゆっくり" の3段階）
   - よくすれ違うエリア（lat/lngから都道府県名だけでOK）
   - 最後にすれ違った日時（"3日前" のような相対表示）
   - 「スタンプを送る」ボタン（MVPではモックでOK。タップで「準備中」Toast）

---

## Task 7: Push通知 ✅

1. expo-notifications のセットアップ
2. ユーザーのExpoPushTokenをFirestore users/{uid}.expoPushToken に保存
3. Cloud Functions の detectEncounters.ts 末尾で:
   - Expo Push API にリクエスト（HTTPで直接送信）
   - メッセージ: "今日 {count}人のランナーとすれ違いました！"
4. 通知タップでホーム画面を開くディープリンクを設定

注意: Expo Push Notifications はサーバーサイドから
https://exp.host/--/api/v2/push/send にPOSTする。
firebase-admin のMessagingは使わない（Expoのラッパーを使う）。

---

## Task 8: 最終調整・動作確認

1. 実機（iOS + Android 両方）でのエンドツーエンド動作確認:
   - 2台の端末でランを開始 → 近い場所で同時に数分走る → 終了 → すれ違い通知が来るか
2. エラーハンドリングの確認:
   - 位置情報権限を拒否した場合の案内UI
   - オフライン時の挙動（Firestoreのオフラインキャッシュ）
3. バッテリー消費の確認（30分走行でのバッテリー減少量を記録）
4. Firestoreのセキュリティルールが意図通り機能しているかテスト
5. README.md を作成（セットアップ方法・環境変数一覧）
