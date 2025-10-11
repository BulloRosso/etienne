# Scheduling Subsystem

I want to implement a scheduler for invoking the REST API endpoint for chat automatically.

We will implement it in the backend using nestjs/schedule to manage cron like taks.

Keep the mangement of the task items exchangable - we will implement first a simple file based approach, but later on we might decide to mange the task definitions and task history in a database.

This is a task definition item:
{
    "name": "Example task"
    "prompt": <user prompt>,
    "cronExpression": <cron expression>,
    "timeZone": "Europe/Berlin"
}

## Frontend
In the frontend we need a new entry "Scheduling" below the menu item "Budget Settings" in ProjectMenu.jsx. This menu item opens a new modal window with scheduled tasks for the current project.

### Task management form
A click on the menu item opens the SchedulingOverview.jsx component in a modal window.

The scheduling menu allows the user to create a task definition which is executed each day, on a single day or several day of the week at a fixed time for a selectable timezone. The user can manage a list of tasks - name and prompt are mandatory. We need a light themed monaco editor to edit the prompt.

#### Tab strip item "Task Definitions"
The user can add, edit or delete tasks in the lists. Each edit is immediatelly send as POST to the API endpoint, so we need no "Save" button.

#### Tab strip item "History"
The user can see the task history (sorted by newest to oldest by timestamp). The response is reduced to the first 80 characters but can be expanded to see the whole response.

### Task indicator in App bar
If there are any scheduled tasks for the project a white "import { TbCalendarTime } from "react-icons/tb";" icon is displayed in the appbar 24px right to the budget indicator. Clicking the item also opens the task management form.

## Backend
The backend has a new service in /src/scheduler which has a service and a controller. It manages scheduling for all projects. 

### REST Endpoints
We have to add (at least) these REST endpoints to the controller:
* GET /api/scheduler/<project>/tasks (retrieve all task definitions of the project)
* GET /api/scheduler/<project>/history (retrieve the task history)
* POST /api/scheduler/<project>/tasks (update the task definitions as complete list)
* GET,PUT, POST,DELETE /api/scheduler/<project>/task (CRUD operations for a single task) 

Don't forget to update list of API endpoints in the readme.md at root file.

### Data storage & initialization at startup
On startup it iterates over all project directories and looks for /workspace/<project>/.etienne/scheduled-task.json files which exist and compiles a single list which then is used to initialize nestjs/schedule.

### Task execution
If a task is due for execution we call the API method which is also used by the frontend to send user messages by passing the prompt in the task item as user message.

After the task was performed we record the time it took and the tokens consumed along with the message returned in a file /workspace/<project>/.etienne/task-history.json. Example content:
{
    "taskHistory": [
       {
        "timestamp": <iso datetime>,
        "name": <task name>,
        "response": <AI model response>,
        "isError": false
       },
       ...
    ]
}

## nestjs/schedule

@nestjs/schedule (Recommended)
This is the official NestJS package for scheduling tasks and integrates seamlessly with the framework. It's built on top of the node-cron package and follows NestJS conventions.
Pros:

Native NestJS integration with decorators
Works with dependency injection
Simple declarative syntax
Well-documented and maintained by the NestJS team
Supports cron expressions, intervals, and timeouts

Installation:
bash 
```
npm install @nestjs/schedule
```
Basic usage:
```
typescriptimport { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

@Injectable()
export class TasksService {
  @Cron('45 * * * * *') // Every minute at 45 seconds
  handleCron() {
    console.log('Task executed');
  }

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  dailyTask() {
    console.log('Daily task');
  }
}
```

import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';

@Injectable()
export class TasksService {
  // Every Monday at 9:00 AM
  @Cron('0 9 * * 1')
  mondayMorningTask() {
    console.log('Monday 9 AM task');
  }

  // Every Wednesday and Friday at 2:30 PM
  @Cron('30 14 * * 3,5')
  midweekAfternoonTask() {
    console.log('Wed & Fri 2:30 PM task');
  }

  // Monday through Friday at 8:00 AM (weekdays)
  @Cron('0 8 * * 1-5')
  weekdayMorningTask() {
    console.log('Weekday 8 AM task');
  }

  // Saturday and Sunday at 10:00 AM (weekends)
  @Cron('0 10 * * 0,6')
  weekendTask() {
    console.log('Weekend 10 AM task');
  }

  // Every day at midnight
  @Cron('0 0 * * *')
  dailyMidnightTask() {
    console.log('Daily midnight task');
  }
}
Day of Week Reference

0 or 7 = Sunday
1 = Monday
2 = Tuesday
3 = Wednesday
4 = Thursday
5 = Friday
6 = Saturday

Additional Options
You can also pass configuration options as a second parameter:
typescript@Cron('0 9 * * 1', {
  name: 'mondayTask',
  timeZone: 'Europe/Berlin',
})
mondayTask() {
  console.log('Monday task in Berlin timezone');
}
The timezone option is particularly useful if your server is in a different timezone than where you want the tasks to run.