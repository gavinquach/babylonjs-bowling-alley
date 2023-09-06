import {
    AbstractMesh,
    ActionManager,
    AnimationGroup,
    ArcRotateCamera,
    ExecuteCodeAction,
    KeyboardEventTypes,
    PhysicsBody,
    PhysicsRaycastResult,
    Quaternion,
    Ray,
    Scene,
    Vector3,
} from "@babylonjs/core";
import Joystick from "./Joystick";
import { EventData, JoystickOutputData } from "nipplejs";

class CharacterController {
    private _scene: Scene;
    private _camera: ArcRotateCamera;
    private _mesh: AbstractMesh;
    private _meshBody: PhysicsBody;
    private _joystick?: Joystick;
    private _raycaster: Ray;
    private _raycastResult: PhysicsRaycastResult;

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
    private static readonly JUMP_FORCE: number = 1000;
    private static readonly DISTANCE_FROM_WALL: number = 0.8;

    private animSpeed: number = 1.0;
    private moveSpeed: number = CharacterController.WALK_SPEED;

    constructor(
        mesh: AbstractMesh,
        meshBody: PhysicsBody,
        camera: ArcRotateCamera,
        scene: Scene,
        joystick?: Joystick,
    ) {
        this._mesh = mesh;
        this._meshBody = meshBody;
        this._camera = camera;
        this._scene = scene;
        this._joystick = joystick;

        this._raycaster = new Ray(new Vector3(0, 0, 0), new Vector3(0, 1, 0));
        this._raycastResult = new PhysicsRaycastResult();

        if (this._joystick !== undefined) {
            const handleJoystickMove = (
                e: EventData,
                data: JoystickOutputData,
            ): void => {
                this._joystick!.setEvent(e);
                this._joystick!.setData(data);
            };

            this._joystick.getManager().on("start", handleJoystickMove);
            this._joystick.getManager().on("move", handleJoystickMove);
            this._joystick.getManager().on("end", handleJoystickMove);
        }

        this.animations.idle = this._scene.getAnimationGroupByName("Idle")!;
        this.animations.walk = this._scene.getAnimationGroupByName("Walk")!;
        this.animations.crouch = this._scene.getAnimationGroupByName("Crouch")!;
        this.animations.run = this._scene.getAnimationGroupByName("Run")!;
        this.animations.rumba = this._scene.getAnimationGroupByName("RumbaDance")!;
        this.animations.sneakwalk =
            this._scene.getAnimationGroupByName("SneakWalk")!;

        this.oldMove = { x: 0, y: 0, z: 0 };

        this.start();
    }

    public start(): void {
        // Keyboard input
        this._scene.actionManager = new ActionManager(this._scene);

        // on key down
        this._scene.actionManager.registerAction(
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
        this._scene.actionManager.registerAction(
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

        this._scene.onKeyboardObservable.add(kbInfo => {
            if (kbInfo.type === KeyboardEventTypes.KEYDOWN) {
                switch (kbInfo.event.key.toLowerCase().trim()) {
                    case "":
                        this.jump();
                        break;
                }
            }
        });

        this._scene.onBeforeRenderObservable.add(() => {
            if (!this.isActive) return;
            this.updateCharacter();
            this.updateCamera();
            this.updateCharacterAnimation();
        });

        this.isActive = true;
    }

    public stop(): void {
        this.isActive = false;
        this._scene.actionManager.dispose();
    }

    private updateCharacterAnimation(): void {
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

    private updateCamera(): void {
        if (!this.isActive) return;
        const translation = this._mesh.position;

        const tmpX = translation.x;
        const tempY = translation.y;
        const tmpZ = translation.z;
        const deltaX = tmpX - this.oldMove.x;
        const deltaY = tempY - this.oldMove.y;
        const deltaZ = tmpZ - this.oldMove.z;
        this.oldMove.x = tmpX;
        this.oldMove.y = tempY;
        this.oldMove.z = tmpZ;

        this._camera.position.x += deltaX;
        this._camera.position.y += deltaY;
        this._camera.position.z += deltaZ;

        this._camera.setTarget(
            new Vector3(translation.x, translation.y + 1.15, translation.z),
        );

        this.updateRaycaster();
    }

    private updateCharacter(): void {
        if (!this.isActive) return;

        // keyboard controls
        const forward = !!this.keyStatus["w"] || !!this.keyStatus["arrowup"];
        const backward = !!this.keyStatus["s"] || !!this.keyStatus["arrowdown"];
        const left = !!this.keyStatus["a"] || !!this.keyStatus["arrowleft"];
        const right = !!this.keyStatus["d"] || !!this.keyStatus["arrowright"];

        if (
            this._joystick?.getEvent()?.type === "move" &&
            this._joystick?.getData()?.angle?.radian
        ) {
            this.isMoving = true;
            this.isDancing = false;

            // calculate direction from joystick
            // add additional 90 degree to the right
            const directionOffset: number =
                -this._joystick.getData().angle?.radian + Math.PI * 0.5;

            // calculate towards camera direction
            const angleYCameraDirection: number = Math.atan2(
                this._camera.position.x - this._mesh.position.x,
                this._camera.position.z - this._mesh.position.z,
            );

            // rotate mesh with respect to camera direction with lerp
            this._mesh.rotationQuaternion = Quaternion.Slerp(
                this._mesh.rotationQuaternion!,
                Quaternion.RotationAxis(
                    Vector3.Up(),
                    angleYCameraDirection + directionOffset,
                ),
                0.2,
            );

            // ========================================================
            // move physics body

            // get joystick x and y vectors
            const joystickVector = this._joystick.getData().vector;
            this.moveDirection.set(joystickVector.x, 0, joystickVector.y);
            this.moveDirection.scaleInPlace(this.moveSpeed * 100);

            // move according to camera's rotation
            this.moveDirection.rotateByQuaternionToRef(
                this._camera.absoluteRotation,
                this.moveDirection,
            );

            // get y velocity to make it behave properly
            const vel = this._meshBody.getLinearVelocity();
            this.moveDirection.y = vel.y;

            // move
            this._meshBody.setLinearVelocity(this.moveDirection);
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
                this._camera.absoluteRotation,
                this.moveDirection,
            );

            // ground the mesh to prevent it from flying
            this.moveDirection.y = 0;

            // calculate towards camera direction
            const angleYCameraDirection = Math.atan2(
                this._camera.position.x - this._mesh.position.x,
                this._camera.position.z - this._mesh.position.z,
            );

            // get direction offset
            const directionOffset = this.calculateDirectionOffset();

            // rotate mesh with respect to camera direction with lerp
            this._mesh.rotationQuaternion = Quaternion.Slerp(
                this._mesh.rotationQuaternion!,
                Quaternion.RotationAxis(
                    Vector3.Up(),
                    angleYCameraDirection + directionOffset,
                ),
                0.2,
            );

            // move the mesh by moving the physics body
            const vel = this._meshBody.getLinearVelocity();
            this.moveDirection.y = vel.y;
            this._meshBody.setLinearVelocity(this.moveDirection);
        } else {
            this._meshBody.setLinearVelocity(this._meshBody.getLinearVelocity());
            this.isMoving = false;
        }
    }

    // this prevents camera from clipping through walls
    updateRaycaster() {
        if (!this._scene.getPhysicsEngine()) return;

        const from = new Vector3(
            this._mesh.position.x,
            this._mesh.position.y + 1.15,
            this._mesh.position.z,
        );
        const to = new Vector3(
            this.camera.position.x,
            this.camera.position.y,
            this.camera.position.z,
        );

        const target = new Vector3(
            this._mesh.position.x,
            this._mesh.position.y + 1.15,
            this._mesh.position.z,
        );

        this._scene.createPickingRayToRef(
            this._scene.pointerX,
            this._scene.pointerY,
            null,
            this._raycaster,
            this._camera,
        );

        (this._scene.getPhysicsEngine() as any)!.raycastToRef(from, to, this._raycastResult);

        if (this._raycastResult.hasHit) {
            const hitPoint = this._raycastResult.hitPointWorld;

            const direction = hitPoint
                .clone()
                .subtractInPlace(this._camera.position)
                .normalize();

            // Computes the distance from hitPoint to this._camera.position
            const distance = Vector3.Distance(hitPoint, this._camera.position);

            // Computes the new position of the camera
            const newPosition = hitPoint.subtract(
                direction.scale(CharacterController.DISTANCE_FROM_WALL * distance),
            );

            // update the max distance of camera
            this._camera.upperRadiusLimit = Vector3.Distance(hitPoint, target);

            // Lerp camera position
            const lerpFactor = 0.8; // Adjust this value for different speeds
            this._camera.position = Vector3.Lerp(this._camera.position, newPosition, lerpFactor);

            this._raycastResult.reset();

            return;
        }

        // reset max distance of camera
        this._camera.upperRadiusLimit = 10;
    }

    private jump(): void {
        if (!this.isActive) return;

        // make mesh jump
        this._meshBody.applyImpulse(
            new Vector3(0, CharacterController.JUMP_FORCE, 0),
            this._mesh.position,
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

    public get scene(): Scene {
        return this._scene;
    }
    public get camera(): ArcRotateCamera {
        return this._camera;
    }
    public get mesh(): AbstractMesh {
        return this._mesh;
    }
    public get meshBody(): PhysicsBody {
        return this._meshBody;
    }
    public get joystick(): Joystick | undefined {
        return this._joystick;
    }

    public dispose(): void {
        this.stop();
    }
}

export default CharacterController;
