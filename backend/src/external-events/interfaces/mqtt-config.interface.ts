export interface MqttBrokerConfig {
  host: string;
  port: number;
  username?: string;
  password?: string;
}

export interface MqttConfig {
  broker?: MqttBrokerConfig;
  subscriptions?: string[];
}

export interface MqttMessage {
  topic: string;
  payload: string;
  timestamp: string;
  qos: number;
  retain: boolean;
}
