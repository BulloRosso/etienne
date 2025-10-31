# Exernal eventing via MQTT

## Backend
We need to create a new module in backend/src/external-events which contains a MQTT client.

We need to connect this agent per default to an public test server:
--------
broker.hivemq.com (HiveMQ)

Host: broker.hivemq.com
Port: 1883 (unencrypted)
WebSocket: 8000
No authentication required
----------
These settings need to be in the .env variables. If there's no file existing in workspace/<project>/.etienne/mqtt-config.json then we use the defaults.

We want to expose api endpoints for this module:
GET, POST api/external-events/broker-setup allows the frontend to display and edit the current broker. When posting back the settings we write the file workspace/<project>/.etienne/mqtt-config.json

POST api/external-events/subscriptions which allows us to subscribe or unsubscribe to an MQTT topic. All events which are received after a successful subscription to a mqtt topic are recorded in a file  workspace/<project>/external-events/mqtt-<topic name>.json.

## Frontend
We need to add a new menu item "External Events" in the ProjectMenu.jsx component. This brings up an new modal "MQTT Settings" which displays the new component MQTTSettings.jsx which allows us to view and change the MQTT servers under a tab strip item "Server". There is a second tab strip item "Subscribe" which allows us to subscribe to a MQTT topic which we can enter in a text input field. There is a action button "Start Listening" which is enabled as soon we entered a topic name. After successfully subscribing to a topic the name is added to the mqtt-config.json and the button reads "Stop Listening". When stopping we need to remove the topic name from mqtt-config.json.