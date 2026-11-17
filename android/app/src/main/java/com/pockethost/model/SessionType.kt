package com.pockethost.model

enum class SessionType {
    BOOTSTRAP,
    BUILD,
    RUNTIME_SERVER,
    TUNNEL,
    SHELL
}

enum class ProcessStatus {
    IDLE,
    STARTING,
    RUNNING,
    STOPPED,
    FAILED
}
