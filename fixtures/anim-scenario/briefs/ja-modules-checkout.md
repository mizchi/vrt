# 課題: 注文処理のモジュール図（日本語ラベル、静止画＋ウォーク）

新入社員向けオンボーディング資料のために `scene.json` を書いてください。
一つのファイルで二つの用途に使います。`vlmkit-anim still` で出す静止画は
モジュール図としてドキュメントに貼り、アニメーションは一件の注文が
モジュールを通る様子を歩いて見せます。

**ラベルはすべて日本語**にしてください（id は事実シートの英語 id をそのまま
使い、`label` に日本語を書く）。読者は日本語話者です。

モジュール（id → ラベル）: `web` → ストアフロント、`gateway` → APIゲートウェイ、
`checkout` → 決済フロー、`inventory` → 在庫管理サービス、`payments` → 支払い、
`orders` → 注文記録、`db` → データベース、`queue` → メッセージキュー。

依存: web → gateway; gateway → checkout; checkout → inventory, payments,
orders; inventory → db; orders → db, queue; payments → queue。
グループ（id → ラベル）: `frontend` → フロントエンド層（web, gateway）、
`domain` → ドメイン層（業務ロジック）（checkout, inventory, payments, orders）、
`platform` → プラットフォーム（db, queue）。

ウォーク: 注文は web から入り、checkout に届く。checkout は在庫を確保し
（inventory → db）、カードに課金し（payments → queue、非同期）、注文を記録する
（orders → db、続けて queue）。最後はモジュール図に戻り、**結果整合性の原因に
なる二本の非同期な依存**（payments → queue と orders → queue）を強調し、
それを一文で説明する `callout` を付けてください。キャプションも日本語で。

上の事実は `facts/ja-modules-checkout.expect.json` にも書いてあります
（`check --expect` が読む形式）。id はそのまま使い、最終フレームで強調する
二本もそこに書いてあるものです。

提出物: `scene.json`、`map.svg`（`vlmkit-anim still`）、`walk.gif`
（`vlmkit-anim video`）、`log.md`。

成功条件: `vlmkit-anim check scene.json --expect facts/ja-modules-checkout.expect.json`
が ✗ も ⚠ もなく 0 で終わる。`vlmkit-anim layout scene.json` が問題なしと報告する。
`explain` が上のウォークとして読める。

`log.md` に必ず書くこと: 手で書いた座標・色・キャンバスサイズがあれば全部と
その理由。日本語ラベルで困ったこと（幅、折り返し、箱からのはみ出し、
ガイドに書いてなかったこと）。図に入れたかったが表現できなかったこと。
