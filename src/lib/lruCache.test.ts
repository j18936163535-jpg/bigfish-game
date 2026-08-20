import { LRUCache } from "./lruCache";

function assert(cond: unknown, msg: string): void {
  if (!cond) {
    throw new Error("FAIL: " + msg);
  }
}

// --- 示例 ---
{
  const c = new LRUCache(2);
  c.put(1, 1);
  c.put(2, 2);
  assert(c.get(1) === 1, "ex1.get(1)");
  c.put(3, 3);
  assert(c.get(2) === -1, "ex1.get(2)");
  c.put(4, 4);
  assert(c.get(1) === -1, "ex1.get(1) after eviction");
  assert(c.get(3) === 3, "ex1.get(3)");
  assert(c.get(4) === 4, "ex1.get(4)");
  assert(c.size() === 2, "ex1.size");
}

// --- capacity 校验 ---
{
  let threw = false;
  try {
    new LRUCache(0);
  } catch {
    threw = true;
  }
  assert(threw, "capacity 0 must throw");

  threw = false;
  try {
    new LRUCache(-1);
  } catch {
    threw = true;
  }
  assert(threw, "capacity -1 must throw");
}

// --- 更新已有 key ---
{
  const c = new LRUCache(2);
  c.put(1, 1);
  c.put(2, 2);
  c.put(1, 10); // 更新
  assert(c.get(1) === 10, "update value");
  c.put(3, 3); // 应淘汰 2
  assert(c.get(2) === -1, "evict 2 after updating 1");
  assert(c.get(3) === 3, "3 present");
}

// --- get 不存在的 key ---
{
  const c = new LRUCache(2);
  assert(c.get(99) === -1, "miss on empty");
  c.put(1, 1);
  assert(c.get(2) === -1, "miss after put");
  assert(c.size() === 1, "size unchanged after miss");
}

// --- get 算作最近使用 ---
{
  const c = new LRUCache(3);
  c.put(1, 1);
  c.put(2, 2);
  c.put(3, 3);
  c.get(1); // 1 现在是最久未使用候选
  c.put(4, 4); // 应淘汰 2
  assert(c.get(2) === -1, "get marks recent use");
  assert(c.get(1) === 1, "1 still present");
}

// --- size 行为 ---
{
  const c = new LRUCache(2);
  assert(c.size() === 0, "size 0 init");
  c.put(1, 1);
  assert(c.size() === 1, "size after put");
  c.put(2, 2);
  assert(c.size() === 2, "size at cap");
  c.put(1, 11);
  assert(c.size() === 2, "size after update");
  c.put(3, 3);
  assert(c.size() === 2, "size after eviction");
}

console.log("All LRU tests passed.");
