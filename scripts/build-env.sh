#!/bin/bash
echo -e "--- HINT --- \nCurrent networks are [ dev | test | main ] To select the desired network, you can use the following command:"
echo -e "\n   export FREEFLOW_NETWORK=main\n"
echo -e "If no network is specified, the default network will be 'dev'.\n"
FREEFLOW_NETWORK="${FREEFLOW_NETWORK:=main}"
echo -e "The default selected network is $FREEFLOW_NETWORK.\n"

# Required variables must be passed before running this script file.
REQUIRED_ENV_VARS=( USER_ID )

# Check if required variables are set
for i in "${REQUIRED_ENV_VARS[@]}"; do
    if ! [[ -v $i ]]; then
        echo -e "--- ERROR ---\n"
        echo -e "$i is required!\nPlease set it by executing the following command:\n"
        echo -e "export $i='Your Value Here'\n"
        exit 1
    fi
done

# Set other variables
APP_BACKEND="https://login.threefold.me/"
BASE_URL="https://freeflow.threefold.be"
giphyApiKey="uk3XRSO0vYrPDEQKDPZJ2wGz33qzIxST"
BETA=true
SESSION_SECRET=$(head /dev/urandom | tr -dc 'a-f0-9' | head -c 10)
APP_DOMAIN="freeflow.threefold.be"
USER_APP_DOMAIN="$USER_ID.$APP_DOMAIN"
DOCUMENT_SERVER_URL="documentserver.freeflow.threefold.be"

# Set domain based on selected network
case $FREEFLOW_NETWORK in
    *"dev"*)
        DOCUMENT_SERVER_URL="documentserver.dev.freeflow.threefold.be"
        BASE_URL="https://freeflow.dev.threefold.be"
        APP_DOMAIN="freeflow.dev.threefold.be"
        USER_APP_DOMAIN="$USER_ID.$APP_DOMAIN"
    ;;
    *"test"*)
        DOCUMENT_SERVER_URL="documentserver.test.freeflow.threefold.be"
        BASE_URL="https://freeflow.test.threefold.be"
        APP_DOMAIN="freeflow.test.threefold.be"
        USER_APP_DOMAIN="$USER_ID.$APP_DOMAIN"
    ;;
esac

# Create frontend config
frontend_config="\
window.config = {
    spawnerUrl: 'https://digitaltwin-test.jimbertesting.be',
    APP_BACKEND: '$APP_BACKEND',
    DOCUMENT_SERVER_URL: '$DOCUMENT_SERVER_URL',
    giphyApiKey: '$giphyApiKey',
    beta: $BETA,
    userId: '$USER_ID',
    BASE_URL: '$BASE_URL',
    APP_DOMAIN: '$USER_APP_DOMAIN'
};
"

# Save frontend config
echo "$frontend_config" > ../apps/frontend/public/config/config.js
echo -e "\tFrontend config saved at ../apps/frontend/public/config/config.js"

# Save spawner frontend config
echo "$frontend_config" > ../apps/spawner/public/config/config.js
echo -e "\tFrontend config saved at ../apps/frontend/public/config/config.js"

# Create backend config
backend_config="\
export default () => ({
    port: 3031,
    FREEFLOW_NETWORK: '$FREEFLOW_NETWORK',
    APP_BACKEND: '$APP_BACKEND',
    userId: '$USER_ID',
    appId: '$USER_APP_DOMAIN',
    baseDir: '/appdata/',
    sessionSecret: '$SESSION_SECRET',
    smallPingTimeoutAxiosRequest: 1000,
    bigPingTimeoutAxiosRequest: 2000,
    DOCUMENT_SERVER_URL: '$DOCUMENT_SERVER_URL',
});
"

# Save backend config
echo "$backend_config" > ../apps/backend/src/config/config.ts
echo -e "\tBackend config saved at ../apps/backend/src/config/config.ts\n"

# Provide information on updating hosts file
echo -e "--- WARNING ---\n"
echo -e "Please don't forget to point the local servers to the user domain that you are working on in the hosts file. To do this, follow the instructions below:\n"
echo -e "1. Open the hosts file using the command: \n   sudo nano /etc/hosts"
echo -e "2. Add the following lines to the hosts file, replacing 'YOUR_DOMAIN' with the actual domain:\n"
echo -e "   127.0.0.1\t$APP_DOMAIN"
echo -e "   127.0.0.1\t$USER_APP_DOMAIN"
echo -e "   127.0.0.1\t$DOCUMENT_SERVER_URL\n"
echo -e "3. Save the hosts file and exit the editor."
echo -e "For more information, please refer to the README document at 'https://github.com/threefoldtech/freeflow_twin_main/blob/main/README.md'.\n"
