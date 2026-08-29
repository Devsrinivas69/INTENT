import sys
import json
import struct
import asyncio
import threading
import websockets

WEBSOCKET_PORT = 18924

connected_ws_clients = set()


def read_native_message():
    raw_length = sys.stdin.buffer.read(4)
    if len(raw_length) < 4:
        return None
    msg_length = struct.unpack('=I', raw_length)[0]
    msg = sys.stdin.buffer.read(msg_length)
    return json.loads(msg.decode('utf-8'))


def send_native_message(msg):
    encoded = json.dumps(msg).encode('utf-8')
    sys.stdout.buffer.write(struct.pack('=I', len(encoded)))
    sys.stdout.buffer.write(encoded)
    sys.stdout.buffer.flush()


async def ws_handler(websocket, path=None):
    connected_ws_clients.add(websocket)
    try:
        async for message in websocket:
            # Forward commands from Electron to Chrome extension
            send_native_message(json.loads(message))
    finally:
        connected_ws_clients.discard(websocket)


async def broadcast_to_ws(data):
    if connected_ws_clients:
        msg = json.dumps(data)
        await asyncio.gather(*[ws.send(msg) for ws in list(connected_ws_clients)],
                             return_exceptions=True)


def native_message_reader_thread(loop):
    while True:
        try:
            msg = read_native_message()
            if msg is None:
                break
            asyncio.run_coroutine_threadsafe(broadcast_to_ws(msg), loop)
        except Exception:
            break


async def main():
    loop = asyncio.get_event_loop()
    t = threading.Thread(target=native_message_reader_thread,
                         args=(loop,), daemon=True)
    t.start()
    async with websockets.serve(ws_handler, "localhost", WEBSOCKET_PORT):
        await asyncio.Future()  # run forever


if __name__ == '__main__':
    asyncio.run(main())
