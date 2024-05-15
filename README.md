# Freeflow Twin

Welcome to FreeFlow Twin (formerly known as Uhuru) – a revolutionary digital experience that empowers users with alternatives to centralized social media, messaging apps, file storage, document management, web browsers, and video conferencing.

## Components

FreeFlow Twin comprises five distinct components, each designed to elevate your digital journey:

1. **Social Media Dashboard (Posts)**: Immerse yourself in a vibrant social media ecosystem where you can seamlessly share your thoughts, engage with others' posts, and enjoy real-time chatting with friends and peers.

2. **Whisper (Messaging)**: Experience a dynamic messaging service that connects you with friends and family, ensuring smooth communication and instant sharing of ideas.

3. **Quantum (File Sharing)**: Unlock the potential of Quantum, a cutting-edge shared-storage software platform. Quantum boasts a high-speed file system that spans diverse storage types within a unified namespace, complete with integrated data lifecycle management capabilities.

4. **Glass (Secure Browsing)**: Glass isn't your ordinary browser; it's a privacy-focused search engine offering the "DuckDuckGo Privacy Essentials" web browser extension. Protect your privacy by thwarting trackers and enforcing encryption while enjoying a seamless browsing experience.

5. **Kutana (Meetings)**: Need a platform for small, collaborative meetings? Look no further than Kutana. Embedded within FreeFlow Twin, Kutana facilitates effortless team gatherings and interactions with friends.

---

We believe in empowering users with freedom of choice and enhanced data privacy, and FreeFlow Twin represents our commitment to a decentralized digital future. Join us on this journey and embrace a new era of online experiences.

---

## Development Setup

To set up the development environment, follow these steps:

1. Create a network called `chatnet` to enable communication between containers. Ensure you have Docker and Docker Compose installed on your local machine, and then execute the following command in the terminal:

```sh
root:~$ docker network create chatnet
```

-   Build and launch the spawner containers:

```sh
root:~$ cd apps/spawner
root:freeflow/apps/spawner$ docker-compose build && docker-compose up -d
# Remove the -d if you want to see the logs.
```

-   After the spawner containers are up, navigate to the main folder and then the dev folder. Create the `appdata` folder and subfolders:

```sh
root:freeflow/apps/spawner$ cd ... &&  cd docker/dev
root:freeflow/docker/dev$ mkdir appdata && mkdir appdata/chats && mkdir appdata/user
# Copy the avatar image to the user folder
cp ../avatar.jpg ./appdata/user/avatar-default.jpg
```

-   Add or edit instances for the chat application in the `docker-compose-example.yml` file. Look for an example commented with `$3bot`, and replace `$3bot` with your desired 3bot name.

```yml
# docker-compose-example.yml
services:
    your-3bot-name-digitaltwin:
        container_name: your-3bot-name-chat
        # ... the rest of the docker-compose file should be updated with your 3bot name
```

Make sure every user has their own appdata folder, and ensure the container name ends with `-chat` (e.g., `your-3bot-name-chat`).
If you don't want the staging login flow, remove the `ENVIRONMENT=development` line or change it to production.
Build and launch the chat containers:

```sh
root:freeflow/docker/dev$ docker-compose build && docker-compose up -d
# Remove the -d if you want to see the logs.
```

Finally, modify your hosts file since this project is `domain-based`. Add two rules to the hosts file, changing `$3bot` to the configured `3bot` name in the `docker-compose` file. Duplicate the rules for every chat container.

### Linux

```sh
root:freeflow/docker/dev$ sudo vim /etc/hosts
```

```vim
127.0.0.1 digitaltwin.jimbertesting.be
127.0.0.1 your-3bot-name.digitaltwin.jimbertesting.be
127.0.0.1 digitaltwin-test.jimbertesting.be,
```

### Windows and macOS

Refer to How to Edit Hosts File in Windows and macOS for instructions on editing the hosts file.

---

Inspired by innovation, driven by freedom. 🚀✨
