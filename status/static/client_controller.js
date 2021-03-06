
let snapshotReqId = 1;

export class ClientController {
  constructor(container, takeSnapshotFn, errorController, time) {
    this.container = container;
    this.takeSnapshotFn = takeSnapshotFn;
    this.errorController = errorController;
    this.time = time;
    this.width = this.container.offsetWidth;
    this.height = this.container.offsetHeight;

    this.wallGeometry = undefined;

    this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.container.appendChild(this.svg);
    this.clients = [];
    this.pendingSnapshots = new Set();
  }
  makeEl() {
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    g.appendChild(rect);
    g.appendChild(text);
    return g;
  }
  setClients(data) {
    for (const d of data) {
      this.newClient(d, false);
    }

    if (this.wallGeometry) {
      this.renderClients();
    }
  }
  calculateTransform() {
    const xs = this.wallGeometry.map(p => p.x);
    const ys = this.wallGeometry.map(p => p.y);
    const w = Math.max(...xs) - Math.min(...xs);
    const h = Math.max(...ys) - Math.min(...ys);

    const B = 20;
    const W = this.width - 2 * B;
    const H = this.height - 2 * B;

    let scale;
    if (W / H > w / h) {
      scale = H / h;
    } else {
      scale = W / w;
    }

    this.tx = x => x * scale + B;
    this.ty = y => y * scale + B;
  }
  setWallGeometry(geo) {
    this.wallGeometry = geo;

    if (!this.wallPath) {
      this.wallPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      this.svg.appendChild(this.wallPath);
    }

    this.calculateTransform();

    this.wallPath.setAttribute('d', this.wallGeometry.map((p, i) => {
      const x = this.tx(p.x);
      const y = this.ty(p.y);
      return `${i == 0 ? 'M' : 'L'}${x},${y}`;
    }).join(' ') + ' Z');

    if (this.clients.length) {
      this.renderClients();
    }
  }
  newClient(d, render = true) {
    this.clients.push({
      id: d,
      rect: d.split(',').map(n => Number(n)),
      element: this.makeEl(),
    });

    if (render && this.wallGeometry) {
      this.renderClients();
    }
  }
  renderClients() {
    for (const c of this.clients) {
      if (!c.element.parentNode) {
        const rect = c.element.firstChild;
        const rectStrokeWidth = 1;
        rect.setAttribute('x', this.tx(c.rect[0]) + rectStrokeWidth);
        rect.setAttribute('y', this.ty(c.rect[1]) + rectStrokeWidth);
        rect.setAttribute('width', this.tx(c.rect[2]) - this.tx(0) - 2*rectStrokeWidth);
        rect.setAttribute('height', this.ty(c.rect[3]) - this.ty(0) - 2*rectStrokeWidth);

        const text = rect.nextSibling;
        text.textContent = c.id;
        text.setAttribute('text-anchor', 'middle');
        text.setAttribute('alignment-baseline', 'central');
        text.setAttribute('x', this.tx(c.rect[0] + c.rect[2] / 2));
        text.setAttribute('y', this.ty(c.rect[1] + c.rect[3] / 2));

        c.element.addEventListener('click', () => {
          if (c.element.getAttribute('class') != 'loading') {
            c.element.setAttribute('class', 'loading');
            const id = snapshotReqId++;
            this.pendingSnapshots.add({
              id,
              timeout: setTimeout(() => {
                // Remove pending snapshot after the timeout.
                const s = [...this.pendingSnapshots].find(s => s.id == id);
                if (s) {
                  this.errorController.error({
                    client: 'status',
                    message: `Snapshot id: ${id} timed out!`,
                    module: 'snapshot',
                    timestampSinceModuleStart: 0,
                    timestamp: this.time(),
                  });
                  this.pendingSnapshots.delete(s);
                  c.element.setAttribute('class', 'failed');
                }
              }, 5000),
            });
            this.takeSnapshotFn({client: c.id, id});
          }
        });

        this.svg.appendChild(c.element);
      }
    }
  }
  takeSnapshotRes(res) {
    // Is this a valid snapshot request?
    const validRequest = [...this.pendingSnapshots].find(s => s.id == res.id);
    if (validRequest) {
      this.pendingSnapshots.delete(validRequest);
    } else {
      this.errorController.error({
        client: 'status',
        message: `Snapshot received unknown res (id: ${res.id})!`,
        module: 'snapshot',
        timestampSinceModuleStart: 0,
        timestamp: this.time(),
      });
      return;
    }
    const c = this.clients.find(c => c.id == res.client);
    const groupEl = c.element;
    // Is there any data in this response?
    if (res.data) {
      // We got a snapshot! Make an image.
      const buffer = new Uint8ClampedArray(res.data);

      // Check if the buffer is totally transparent! This is an error condition.
      const allEmpty = buffer.every(b => !b);
      if (allEmpty) {
        // We asked for an image... we got an empty array!
        // TODO(applmak): Update text or something.
        groupEl.setAttribute('class', 'failed');
        this.errorController.error({
          client: 'status',
          message: 'Snapshot failed: All pixels are empty!',
          module: 'snapshot',
          timestampSinceModuleStart: 0,
          timestamp: this.time(),
        });
      } else {
        const data = new ImageData(buffer, res.width, buffer.length / 4 / res.width);
        const canvas = document.createElement('canvas');
        canvas.width = data.width;
        canvas.height = data.height;
        const context = canvas.getContext('2d');
        context.putImageData(data, 0, 0);
        const url = canvas.toDataURL('image/png');

        Array.from(groupEl.querySelectorAll('image')).forEach(e => e.remove());
        const image = document.createElementNS('http://www.w3.org/2000/svg', 'image');
        image.setAttribute('href', url);
        image.setAttribute('x', this.tx(c.rect[0]));
        image.setAttribute('y', this.ty(c.rect[1]));
        image.setAttribute('width', this.tx(c.rect[2]) - this.tx(c.rect[0]));
        image.setAttribute('height', this.ty(c.rect[3]) - this.ty(c.rect[1]));
        groupEl.appendChild(image);

        groupEl.setAttribute('class', null);
      }
    } else {
      groupEl.setAttribute('class', 'failed');
      this.errorController.error({
        client: 'status',
        message: `Snapshot contained no data! Perhaps the module doesn't support snapshots?`,
        module: 'snapshot',
        timestampSinceModuleStart: 0,
        timestamp: this.time(),
      });
    }
  }
  lostClient(c) {
    const i = this.clients.findIndex(client => client.id == c);
    if (i >= 0) {
      this.clients[i].element.remove();
      this.clients.splice(i, 1);
    }
  }
  disconnect() {
    this.clients.length = 0;
    this.wallPath = null;
  }
}
