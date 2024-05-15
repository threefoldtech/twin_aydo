#!/bin/bash
# Set environment variables
SSH_KEY="$SSH_KEY"
USER_ID="$USER_ID"
DIGITALTWIN_APPID="$DIGITALTWIN_APPID"
NODE_ENV="$NODE_ENV"
ENVIRONMENT="$ENVIRONMENT"
DOCUMENT_SERVER_URL="https://documentserver.demo.freeflow.life"
APP_BACKEND="https://login.threefold.me/"
FILE=/appdata/yggdrasil.conf

if test -f "$FILE"; then
    echo "$FILE already exists."
    exec yggdrasil -useconffile $FILE -logto /var/log/yggdrasil/yggdrasil.log >> /var/log/yggdrasil/yggdrasil.log &
fi

cd /app/apps/backend/dist
node migrator/migrator.js

backend_config="\
export default {
    appBackend: '$APP_BACKEND',
    documentServerLocation: '$DOCUMENT_SERVER_URL',
    giphyApiKey: 'uk3XRSO0vYrPDEQKDPZJ2wGz33qzIxST',
    beta: true,
    test: 'yes:D'
};
"

# Save the backend configuration to a file
echo "Copying production config"
echo "$backend_config" > "/usr/share/nginx/html/config/config-def.js"
echo -e "\tBackend config saved at /usr/share/nginx/html/config/config-def.js"
echo "DONE"
