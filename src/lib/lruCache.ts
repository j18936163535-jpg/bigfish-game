/**
 * LRU Cache (Least Recently Used)
 *
 * 实现思路：
 *   - 哈希表 Map 用于 O(1) 定位 key 对应的节点（仅作为哈希表使用，不依赖插入顺序）。
 *   - 双向链表 维护访问顺序：head 端为"最近使用"，tail 端为"最久未使用"。
 *   - 所有 get / put 都通过哈希表 + 链表指针完成，单步 O(1)。
 *
 *   head <-> node1 <-> node2 <-> ... <-> tail
 *   ^最近使用                            ^最久未使用
 */

class Node {
  key: number;
  value: number;
  prev: Node | null;
  next: Node | null;

  constructor(key: number, value: number) {
    this.key = key;
    this.value = value;
    this.prev = null;
    this.next = null;
  }
}

export class LRUCache {
  private readonly capacity: number;
  private readonly map: Map<number, Node>;
  // 哨兵节点，避免处理 null 边界
  private readonly head: Node; // head.next 为最近使用
  private readonly tail: Node; // tail.prev 为最久未使用
  private count: number;

  constructor(capacity: number) {
    if (!Number.isFinite(capacity) || capacity <= 0) {
      throw new Error("Invalid capacity");
    }
    this.capacity = capacity;
    this.map = new Map();
    this.count = 0;
    this.head = new Node(0, 0);
    this.tail = new Node(0, 0);
    this.head.next = this.tail;
    this.tail.prev = this.head;
  }

  get(key: number): number {
    const node = this.map.get(key);
    if (node === undefined) {
      return -1;
    }
    this.moveToHead(node);
    return node.value;
  }

  put(key: number, value: number): void {
    const existing = this.map.get(key);
    if (existing !== undefined) {
      existing.value = value;
      this.moveToHead(existing);
      return;
    }

    const node = new Node(key, value);
    this.map.set(key, node);
    this.addAfterHead(node);
    this.count++;

    if (this.count > this.capacity) {
      const evicted = this.removeBeforeTail();
      if (evicted) {
        this.map.delete(evicted.key);
      }
      this.count--;
    }
  }

  size(): number {
    return this.count;
  }

  // ---------- 双向链表辅助操作 ----------

  private addAfterHead(node: Node): void {
    node.prev = this.head;
    node.next = this.head.next;
    this.head.next!.prev = node;
    this.head.next = node;
  }

  private removeNode(node: Node): void {
    const prev = node.prev!;
    const next = node.next!;
    prev.next = next;
    next.prev = prev;
    node.prev = null;
    node.next = null;
  }

  private moveToHead(node: Node): void {
    this.removeNode(node);
    this.addAfterHead(node);
  }

  private removeBeforeTail(): Node | null {
    const target = this.tail.prev;
    if (target === null || target === this.head) {
      return null;
    }
    this.removeNode(target);
    return target;
  }
}
