import { LRUCache } from "./lru-cache";

function assertEqual<T>(actual: T, expected: T, msg: string): void {
  if (actual !== expected) {
    console.error(`FAIL: ${msg} — expected ${expected}, got ${actual}`);
    process.exit(1);
  } else {
    console.log(`PASS: ${msg}`);
  }
}

console.log("=== 示例测试 ===");

// 示例
const cache = new LRUCache(2);
cache.put(1, 1);          // [1]
assertEqual(cache.size(), 1, "size=1 after put(1,1)");

cache.put(2, 2);          // [1,2]
assertEqual(cache.size(), 2, "size=2 after put(2,2)");

assertEqual(cache.get(1), 1, "get(1) returns 1");  // [2,1] — 1 变为最近
assertEqual(cache.size(), 2, "size still 2 after get(1)");

cache.put(3, 3);          // 淘汰 2 → [1,3]
assertEqual(cache.size(), 2, "size still 2 after put(3,3) evicting 2");

assertEqual(cache.get(2), -1, "get(2) returns -1 (evicted)");

cache.put(4, 4);          // 淘汰 1 → [3,4]
assertEqual(cache.get(1), -1, "get(1) returns -1 (evicted)");

assertEqual(cache.get(3), 3, "get(3) returns 3");
assertEqual(cache.get(4), 4, "get(4) returns 4");

console.log("\n=== 边界测试 ===");

// 容量为 0 应抛错
try {
  new LRUCache(0);
  console.error("FAIL: should throw on capacity 0");
  process.exit(1);
} catch (e) {
  assertEqual((e as Error).message, "Invalid capacity", "capacity 0 throws Invalid capacity");
}

// 容量为负数应抛错
try {
  new LRUCache(-1);
  console.error("FAIL: should throw on capacity -1");
  process.exit(1);
} catch (e) {
  assertEqual((e as Error).message, "Invalid capacity", "capacity -1 throws Invalid capacity");
}

// 容量为 1
const cache1 = new LRUCache(1);
cache1.put(1, 1);
assertEqual(cache1.get(1), 1, "get(1) returns 1 in cap=1");
cache1.put(2, 2);
assertEqual(cache1.get(1), -1, "get(1) evicted in cap=1");
assertEqual(cache1.get(2), 2, "get(2) returns 2 in cap=1");
assertEqual(cache1.size(), 1, "size=1 in cap=1");

// 更新已有 key 的值
const cache2 = new LRUCache(2);
cache2.put(1, 10);
cache2.put(1, 100);
assertEqual(cache2.get(1), 100, "update value for existing key");
assertEqual(cache2.size(), 1, "size stays 1 after update");

// get 不存在的 key
const cache3 = new LRUCache(3);
assertEqual(cache3.get(999), -1, "get non-existent key returns -1");

// get 后再 put 同样 key
const cache4 = new LRUCache(2);
cache4.put(1, "a".charCodeAt(0));
cache4.put(2, "b".charCodeAt(0));
cache4.get(1);  // 访问 1，现在顺序 [2,1]
cache4.put(3, "c".charCodeAt(0));  // 应淘汰 2
assertEqual(cache4.get(2), -1, "2 evicted after get(1)+put(3)");
assertEqual(cache4.get(1), "a".charCodeAt(0), "1 still present after get+put(3)");
assertEqual(cache4.get(3), "c".charCodeAt(0), "3 present");

// 多次操作后顺序正确
const cache5 = new LRUCache(3);
cache5.put(1, 1);  // [1]
cache5.put(2, 2);  // [1,2]
cache5.put(3, 3);  // [1,2,3] — 满
assertEqual(cache5.get(2), 2, "get(2)");  // [1,3,2] — 2 变最近
cache5.put(4, 4);   // 淘汰 1 → [3,2,4]
assertEqual(cache5.get(1), -1, "1 evicted");
assertEqual(cache5.get(3), 3, "3 present");
assertEqual(cache5.get(4), 4, "4 present");
assertEqual(cache5.get(2), 2, "2 present");

console.log("\n✅ 所有测试通过！");