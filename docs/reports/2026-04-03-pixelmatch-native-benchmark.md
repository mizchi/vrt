# pixelmatch 実装比較ベンチマーク (native 追加)

**日付**: 2026-04-03

## 結果

500x500 identical images での比較:

| 実装 | 時間 | 倍率 (vs npm v7) |
|------|------|:----------------:|
| **MoonBit native** | **85µs** | **6.6x faster** |
| npm pixelmatch v7 (JS) | 560µs | 1x |
| MoonBit WASM-GC | 1,110µs | 0.5x |
| MoonBit JS | 1,940µs | 0.3x |

## Native ビルドの修正

MoonBit native ビルドは `mizchi/zlib` の FFI stub (`zlib_impl_native.c`) がシステムの zlib にリンクする必要がある。

**問題**: `cc-link-flags: "-lz"` が `mizchi/zlib` の `moon.pkg` に設定されているが、依存先のテスト/ベンチバイナリのリンクには自動伝播しない。

**修正** (mizchi/pixelmatch):
```
# src/moon.pkg に追加
options(
  link: { "native": { "cc-link-flags": "-lz" } },
)
```

`src/moon.pkg` と `src/e2e/moon.pkg` の両方に追加が必要。

## VRT harness への含意

- **PNG encode (153ms) が最大のボトルネック** — pixelmatch 自体は高速
- Native pixelmatch は 85µs (6.6x) だが、Node.js から呼ぶには WASM component 経由が必要
- **最適化の方向**: crater の `capturePaintData` (生 RGBA) → pixelmatch 直接比較で PNG encode/decode スキップ
- Paint tree diff (0.07ms) は pixelmatch native (0.085ms) と同等速度
