class ListNode {
  key: number;
  value: number;
  prev: ListNode | null = null;
  next: ListNode | null = null;

  constructor(key: number, value: number) {
    this.key = key;
    this.value = value;
  }
}

class DoublyLinkedList {
  head: ListNode | null = null;
  tail: ListNode | null = null;
  size = 0;

  addToHead(node: ListNode): void {
    node.prev = null;
    node.next = this.head;
    if (this.head) {
      this.head.prev = node;
    }
    this.head = node;
    if (!this.tail) {
      this.tail = node;
    }
    this.size++;
  }

  remove(node: ListNode): void {
    if (node.prev) {
      node.prev.next = node.next;
    } else {
      this.head = node.next;
    }
    if (node.next) {
      node.next.prev = node.prev;
    } else {
      this.tail = node.prev;
    }
    node.prev = null;
    node.next = null;
    this.size--;
  }

  removeTail(): ListNode | null {
    if (!this.tail) return null;
    const node = this.tail;
    this.remove(node);
    return node;
  }

  moveToHead(node: ListNode): void {
    this.remove(node);
    this.addToHead(node);
  }
}

export class LRUCache {
  private capacity: number;
  private map: Map<number, ListNode>;
  private list: DoublyLinkedList;

  constructor(capacity: number) {
    if (capacity <= 0) {
      throw new Error("Invalid capacity");
    }
    this.capacity = capacity;
    this.map = new Map();
    this.list = new DoublyLinkedList();
  }

  get(key: number): number {
    const node = this.map.get(key);
    if (!node) return -1;
    this.list.moveToHead(node);
    return node.value;
  }

  put(key: number, value: number): void {
    const existingNode = this.map.get(key);
    if (existingNode) {
      existingNode.value = value;
      this.list.moveToHead(existingNode);
      return;
    }
    if (this.list.size >= this.capacity) {
      const lruNode = this.list.removeTail();
      if (lruNode !== null) {
        this.map.delete(lruNode.key);
      }
    }
    const node = new ListNode(key, value);
    this.list.addToHead(node);
    this.map.set(key, node);
  }

  size(): number {
    return this.list.size;
  }
}