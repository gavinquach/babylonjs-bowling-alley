import {
    AbstractMesh,
    ActionManager,
    AnimationGroup,
    ArcRotateCamera,
    ExecuteCodeAction,
    KeyboardEventTypes,
    PhysicsBody,
    Quaternion,
    Scene,
    Vector3,
} from "@babylonjs/core";
import Joystick from "./Joystick";
import { EventData, JoystickOutputData } from "nipplejs";

class CharacterController {
    public scene: Scene;
    public camera: ArcRotateCamera;
    public mesh: AbstractMesh;
    public meshBody: PhysicsBody;
    public joystick?: Joystick;
    private animations: {
        [key: string]: AnimationGroup;
    } = {};
    private isActive: boolean = false;
    private isDancing: boolean = false;
    private isCrouching: boolean = false;
    private isMoving: boolean = false;
    private isRunning: boolean = false;

    private keyStatus: {
        [key: string]: boolean;
    } = {
            " ": false, // space
            Shift: false,
            w: false,
            arrowup: false,
            a: false,
            arrowleft: false,
            s: false,
            arrowright: false,
            d: false,
            arrowdown: false,
        };

    private oldMove: { x: number; y: number; z: number };
    private moveDirection: Vector3 = new Vector3(0, 0, 0);
    private frontVector: Vector3 = new Vector3(0, 0, 0);
    private sideVector: Vector3 = new Vector3(0, 0, 0);

    private static readonly CROUCH_SPEED: number = 0.015;
    private static readonly WALK_SPEED: number = 0.03;
    private static readonly RUN_SPEED: number = 0.08;
    private static readonly JUMP_FORCE: number = 500;

    private animSpeed: number = 1.0;
    private moveSpeed: number = CharacterController.WALK_SPEED;

    constructor(
        mesh: AbstractMesh,
        meshBody: PhysicsBody,
        camera: ArcRotateCamera,
        scene: Scene,
        joystick?: Joystick,
    ) {
        this.mesh = mesh;
        this.meshBody = meshBody;
        this.camera = camera;
        this.scene = scene;
        this.joystick = joystick;

        if (this.joystick !== undefined) {
            const handleJoystickMove = (
                e: EventData,
                data: JoystickOutputData,
            ): void => {
                this.joystick!.setEvent(e);
                this.joystick!.setData(data);
            };

            this.joystick.getManager().on("start", handleJoystickMove);
            this.joystick.getManager().on("move", handleJoystickMove);
            this.joystick.getManager().on("end", handleJoystickMove);
        }

        this.animations.idle = this.scene.getAnimationGroupByName("Idle")!;
        this.animations.walk = this.scene.getAnimationGroupByName("Walk")!;
        this.animations.crouch = this.scene.getAnimationGroupByName("Crouch")!;
        this.animations.run = this.scene.getAnimationGroupByName("Run")!;
        this.animations.rumba = this.scene.getAnimationGroupByName("RumbaDance")!;
        this.animations.sneakwalk =
            this.scene.getAnimationGroupByName("SneakWalk")!;

        this.oldMove = { x: 0, y: 0, z: 0 };

        this.start();
    }

    public start(): void {
        // Keyboard input
        this.scene.actionManager = new ActionManager(this.scene);

        // on key down
        this.scene.actionManager.registerAction(
            new ExecuteCodeAction(ActionManager.OnKeyDownTrigger, e => {
                let key = e.sourceEvent.key.toLowerCase();

                if (key === "shift") {
                    // slow down if shift is held
                    this.moveSpeed = CharacterController.CROUCH_SPEED;

                    this.isCrouching = true;
                    // stop dancing animation
                    this.isDancing = false;
                }
                if (key === "control") {
                    this.toggleRun();
                }

                if (key === "g") {
                    this.isDancing = !this.isDancing;
                }
                if (key in this.keyStatus) {
                    this.keyStatus[key] = true;
                }
            }),
        );

        // on key up
        this.scene.actionManager.registerAction(
            new ExecuteCodeAction(ActionManager.OnKeyUpTrigger, e => {
                let key = e.sourceEvent.key.toLowerCase();

                if (key === "shift") {
                    this.isCrouching = false;

                    if (!this.isRunning) {
                        this.moveSpeed = CharacterController.WALK_SPEED;
                    } else {
                        this.moveSpeed = CharacterController.RUN_SPEED;
                    }
                }
                if (key in this.keyStatus) {
                    this.keyStatus[key] = false;
                }
            }),
        );

        this.scene.onKeyboardObservable.add(kbInfo => {
            if (kbInfo.type === KeyboardEventTypes.KEYDOWN) {
                switch (kbInfo.event.key.toLowerCase().trim()) {
                    case "":
                        this.jump();
                        break;
                }
            }
        });

        this.scene.onBeforeRenderObservable.add(() => {
            if (!this.isActive) return;
            this.updateCharacter();
            this.updateCamera();
        });

        this.isActive = true;
    }

    public stop(): void {
        this.isActive = false;
        this.scene.actionManager.dispose();
    }

    private updateCamera(): void {
        if (!this.isActive) return;
        const translation = this.mesh.position;

        const tmpX = translation.x;
        const tempY = translation.y;
        const tmpZ = translation.z;
        const deltaX = tmpX - this.oldMove.x;
        const deltaY = tempY - this.oldMove.y;
        const deltaZ = tmpZ - this.oldMove.z;
        this.oldMove.x = tmpX;
        this.oldMove.y = tempY;
        this.oldMove.z = tmpZ;

        this.camera.position.x += deltaX;
        this.camera.position.y += deltaY;
        this.camera.position.z += deltaZ;

        this.camera.setTarget(
            new Vector3(translation.x, translation.y + 1.15, translation.z),
        );
    }

    private updateCharacter(): void {
        if (!this.isActive) return;

        // keyboard controls
        const forward = !!this.keyStatus["w"] || !!this.keyStatus["arrowup"];
        const backward = !!this.keyStatus["s"] || !!this.keyStatus["arrowdown"];
        const left = !!this.keyStatus["a"] || !!this.keyStatus["arrowleft"];
        const right = !!this.keyStatus["d"] || !!this.keyStatus["arrowright"];

        if (
            this.joystick?.getEvent()?.type === "move" &&
            this.joystick?.getData()?.angle?.radian
        ) {
            this.isMoving = true;
            this.isDancing = false;

            // calculate direction from joystick
            // add additional 90 degree to the right
            const directionOffset: number =
                -this.joystick.getData().angle?.radian + Math.PI * 0.5;

            // calculate towards camera direction
            const angleYCameraDirection: number = Math.atan2(
                this.camera.position.x - this.mesh.position.x,
                this.camera.position.z - this.mesh.position.z,
            );

            // rotate mesh with respect to camera direction with lerp
            this.mesh.rotationQuaternion = Quaternion.Slerp(
                this.mesh.rotationQuaternion!,
                Quaternion.RotationAxis(
                    Vector3.Up(),
                    angleYCameraDirection + directionOffset,
                ),
                0.2,
            );

            // ========================================================
            // move physics body

            // get joystick x and y vectors
            const joystickVector = this.joystick.getData().vector;
            this.moveDirection.set(joystickVector.x, 0, joystickVector.y);
            this.moveDirection.scaleInPlace(this.moveSpeed * 100);

            // move according to camera's rotation
            this.moveDirection.rotateByQuaternionToRef(
                this.camera.absoluteRotation,
                this.moveDirection,
            );

            // get y velocity to make it behave properly
            const vel = this.meshBody.getLinearVelocity();
            this.moveDirection.y = vel.y;

            // move
            this.meshBody.setLinearVelocity(this.moveDirection);
        } else if (forward || backward || left || right) {
            this.isMoving = true;
            this.isDancing = false;

            this.frontVector.set(0, 0, forward ? 1 : backward ? -1 : 0);
            this.sideVector.set(left ? 1 : right ? -1 : 0, 0, 0);

            this.moveDirection.set(
                this.frontVector.x - this.sideVector.x,
                0,
                this.frontVector.z - this.sideVector.z,
            );
            this.moveDirection.normalize();
            this.moveDirection.scaleInPlace(this.moveSpeed * 100);

            // move according to camera's rotation
            this.moveDirection.rotateByQuaternionToRef(
                this.camera.absoluteRotation,
                this.moveDirection,
            );

            // ground the mesh to prevent it from flying
            this.moveDirection.y = 0;

            // calculate towards camera direction
            const angleYCameraDirection = Math.atan2(
                this.camera.position.x - this.mesh.position.x,
                this.camera.position.z - this.mesh.position.z,
            );

            // get direction offset
            const directionOffset = this.calculateDirectionOffset();

            // rotate mesh with respect to camera direction with lerp
            this.mesh.rotationQuaternion = Quaternion.Slerp(
                this.mesh.rotationQuaternion!,
                Quaternion.RotationAxis(
                    Vector3.Up(),
                    angleYCameraDirection + directionOffset,
                ),
                0.2,
            );

            // move the mesh by moving the physics body
            const vel = this.meshBody.getLinearVelocity();
            this.moveDirection.y = vel.y;
            this.meshBody.setLinearVelocity(this.moveDirection);
        } else {
            this.meshBody.setLinearVelocity(this.meshBody.getLinearVelocity());
            this.isMoving = false;
        }

        if (this.isMoving) {
            if (this.isCrouching) {
                // play sneakwalk animation if shift is held
                this.playAnimation("sneakwalk");
            } else {
                if (!this.isRunning) {
                    this.playAnimation("walk");
                    return;
                }
                this.playAnimation("run");
            }
        } else {
            if (this.isDancing) {
                // play dance animation if g is pressed
                this.playAnimation("rumba");
            } else if (this.isCrouching) {
                // play crouch animation if shift is held
                this.playAnimation("crouch");
            } else {
                // play idle animation if no movement keys are pressed
                this.playAnimation("idle");
            }
        }
    }

    private jump(): void {
        if (!this.isActive) return;

        // make mesh jump

        this.meshBody.applyImpulse(
            new Vector3(0, CharacterController.JUMP_FORCE, 0),
            this.mesh.position,
        );
        console.log("called jump");
    }

    private toggleRun(): void {
        this.isRunning = !this.isRunning;
        this.moveSpeed = this.isRunning
            ? CharacterController.RUN_SPEED
            : CharacterController.WALK_SPEED;
    }

    private calculateDirectionOffset(): number {
        let directionOffset = 0; // w

        // switch case version
        switch (true) {
            case this.keyStatus["w"] || this.keyStatus["arrowup"]:
                switch (true) {
                    case this.keyStatus["d"] || this.keyStatus["arrowright"]:
                        directionOffset = Math.PI * 0.25; // w + d
                        break;
                    case this.keyStatus["a"] || this.keyStatus["arrowleft"]:
                        directionOffset = -Math.PI * 0.25; // w + a
                        break;
                    default:
                        directionOffset = 0; // w
                        break;
                }
                break;
            case this.keyStatus["s"] || this.keyStatus["arrowdown"]:
                switch (true) {
                    case this.keyStatus["d"] || this.keyStatus["arrowright"]:
                        directionOffset = Math.PI * 0.25 + Math.PI * 0.5; // w + d
                        break;
                    case this.keyStatus["a"] || this.keyStatus["arrowleft"]:
                        directionOffset = -Math.PI * 0.25 - Math.PI * 0.5; // w + a
                        break;
                    default:
                        directionOffset = Math.PI; // s
                        break;
                }
                break;
            case this.keyStatus["d"] || this.keyStatus["arrowright"]:
                directionOffset = Math.PI * 0.5; // d
                break;
            case this.keyStatus["a"] || this.keyStatus["arrowleft"]:
                directionOffset = -Math.PI * 0.5; // a
                break;
            default:
                directionOffset = 0; // s
                break;
        }

        return directionOffset;
    }

    private playAnimation(name: string) {
        Object.entries(this.animations).forEach(([animName, animationGroup]) => {
            if (animName === name) {
                this.animations[name].start(
                    true,
                    this.animSpeed,
                    this.animations[name].from,
                    this.animations[name].to,
                    false,
                );
            } else {
                animationGroup.stop();
            }
        });
    }

    public dispose(): void {
        this.stop();
    }
}

export default CharacterController;
