# Words

We might need different names for different instances of the same Chrome-
extension so there can be multiple Chrome toolbar buttons for multiple
bookmarklets.

We could just do `bm-runner-1, 2, 3, 4` tho.

## Words like Runner

> Give me a set of single-word terms that I might use to refer to a "task
> runner" e.g. "runner" or "executor"

Here are a variety of single-word terms, grouped loosely by nuance:

**Execution-focused**

- Runner
- Executor
- Dispatcher
- Invoker
- Launcher
- Starter
- Trigger
- Driver
- Performer
- Worker

**Scheduling/orchestration**

- Scheduler
- Orchestrator
- Coordinator
- Conductor
- Director
- Controller
- Manager
- Planner
- Broker
- Mediator

**Processing**

- Processor
- Handler
- Engine
- Pipeline
- Interpreter
- Evaluator
- Resolver
- Dispatcher
- Consumer
- Operator

**Automation**

- Agent
- Automator
- Daemon
- Service
- Monitor
- Watcher
- Sentinel

**Concurrency/distributed systems**

- Worker
- Node
- Peer
- Client
- Host
- Instance
- Thread
- Process
- Replica

**Queue/job terminology**

- Jobber
- Consumer
- Drainer
- Dequeuer
- Poller
- Retriever

**General-purpose**

- Module
- Component
- Unit
- Facility
- Utility
- Mechanism
- System
- Core
- Backend

### If you're naming a software component

Some of the cleanest and most conventional choices are:

- Runner — executes tasks directly.
- Executor — emphasizes execution semantics (common in Java/C++/Rust).
- Worker — suggests background processing.
- Engine — implies a more capable execution subsystem.
- Scheduler — if it decides _when_ tasks run.
- Orchestrator — if it coordinates multiple tasks.
- Dispatcher — if it routes tasks to workers.
- Coordinator — if it manages execution across components.
- Handler — if tasks are event-driven.
- Agent — if it's an autonomous process.

### Less common but distinctive

- Catalyst
- Forge
- Nexus
- Relay
- Relayor (rare)
- Catalyst
- Pilot
- Marshal
- Steward
- Arbiter
- Conduit
- Harness

If your "task runner" is specifically a library or framework API, I'd lean
toward **Runner**, **Executor**, **Worker**, **Engine**, or **Orchestrator**,
depending on whether its role is simply executing tasks or also coordinating and
scheduling them.
