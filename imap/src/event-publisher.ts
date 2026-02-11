import * as zmq from 'zeromq';
import { v4 as uuidv4 } from 'uuid';
import { EmailPayload } from './types';

const IPC_ADDRESS = 'ipc:///tmp/etienne-events-pull';

export async function publishEmailEvent(payload: EmailPayload): Promise<void> {
  const event = {
    id: uuidv4(),
    timestamp: new Date().toISOString(),
    name: 'Email Received',
    group: 'Email',
    source: 'IMAP Connector',
    payload,
  };

  const pushSocket = new zmq.Push();
  try {
    await pushSocket.connect(IPC_ADDRESS);
    await pushSocket.send(JSON.stringify(event));
  } finally {
    await pushSocket.close();
  }
}
