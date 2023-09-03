import nipplejs, {
    EventData,
    JoystickManager,
    JoystickOutputData,
} from "nipplejs";

class Joystick {
    private manager: JoystickManager;
    private event: EventData;
    private data: JoystickOutputData;

    constructor() {
        const joystickContainer = document.createElement("div");
        joystickContainer.id = "joystick";
        joystickContainer.style.position = "absolute";
        joystickContainer.style.bottom = "15%";
        joystickContainer.style.left = "10%";
        joystickContainer.style.zIndex = "10";
        document.getElementById("app")!.appendChild(joystickContainer);

        this.manager = nipplejs.create({
            zone: document.querySelector("#joystick") as HTMLElement,
            size: 100 * (window.innerHeight / 720),
            mode: "static",
            position: { top: "50%", left: "50%" },
        });
        this.event = null!;
        this.data = null!;
    }

    public getManager(): JoystickManager {
        return this.manager;
    }
    public getEvent(): EventData {
        return this.event;
    }
    public getData(): JoystickOutputData {
        return this.data;
    }
    public setEvent(e: EventData): void {
        this.event = e;
    }
    public setData(data: JoystickOutputData): void {
        this.data = data;
    }

    public dispose(): void {
        this.manager.destroy();
    }
}

export default Joystick;
