import {
    AbstractMesh,
    ActionManager,
    AnimationGroup,
    ArcRotateCamera,
    ExecuteCodeAction,
    KeyboardEventTypes,
    Scene,
    Vector3,
} from "@babylonjs/core";

class CharacterController {
    public scene: Scene;
    public camera: ArcRotateCamera;
    public mesh: AbstractMesh;
    private animations: {
        [key: string]: AnimationGroup;
    } = {};
    private isActive: boolean = false;
    private isMoving: boolean = false;

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

    private static readonly WALK_SPEED: number = 0.03;
    private static readonly CROUCH_SPEED: number = 0.015;
    private static readonly JUMP_FORCE: number = 50;

    private animSpeed: number = 1.0;
    private moveSpeed: number = CharacterController.WALK_SPEED;

    constructor(mesh: AbstractMesh, camera: ArcRotateCamera, scene: Scene) {
        this.mesh = mesh;
        this.camera = camera;
        this.scene = scene;

        this.animations.idle = this.scene.getAnimationGroupByName("Idle")!;
        this.animations.walk = this.scene.getAnimationGroupByName("Walking")!;
        this.animations.crouch = this.scene.getAnimationGroupByName("Crouching")!;
        this.animations.sneakwalk =
            this.scene.getAnimationGroupByName("SneakWalk")!;

        this.oldMove = { x: 0, y: 0, z: 0 };

        this.start();
    }

    public start(): void {
        this.isActive = true;

        // Keyboard input
        this.scene.actionManager = new ActionManager(this.scene);

        // on key down
        this.scene.actionManager.registerAction(
            new ExecuteCodeAction(ActionManager.OnKeyDownTrigger, e => {
                let key = e.sourceEvent.key;
                if (key !== "Shift") {
                    key = key.toLowerCase();
                }
                if (key in this.keyStatus) {
                    this.keyStatus[key] = true;
                }
            }),
        );

        // on key up
        this.scene.actionManager.registerAction(
            new ExecuteCodeAction(ActionManager.OnKeyUpTrigger, e => {
                let key = e.sourceEvent.key;
                if (key !== "Shift") {
                    key = key.toLowerCase();
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
            this.updateCharacter();
            this.updateCamera();
        });
    }

    public stop(): void {
        this.scene.actionManager.dispose();
        this.scene.onBeforeRenderObservable.clear();
        this.isActive = false;
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
            new Vector3(translation.x, translation.y + 2.5, translation.z),
        );
    }

    private updateCharacter(): void {
        if (!this.isActive) return;

        // keyboard controls
        const forward = !!this.keyStatus["w"] || !!this.keyStatus["arrowup"];
        const backward = !!this.keyStatus["s"] || !!this.keyStatus["arrowdown"];
        const left = !!this.keyStatus["a"] || !!this.keyStatus["arrowleft"];
        const right = !!this.keyStatus["d"] || !!this.keyStatus["arrowright"];
        const shift = !!this.keyStatus["Shift"];

        // console.log(this.camera.rotationQuaternion);

        if (forward) {
            this.animations.walk.start(
                true,
                this.animSpeed,
                this.animations.walk.from,
                this.animations.walk.to,
                false,
            );
        }
        if (backward) {
            this.animations.walk.start(
                true,
                this.animSpeed,
                this.animations.walk.to,
                this.animations.walk.from,
                false,
            );
        }
        if (left) {
            // this.mesh.rotate(Vector3.Up(), -CharacterController.CROUCH_SPEED);
            this.animations.walk.start(
                true,
                this.animSpeed,
                this.animations.walk.from,
                this.animations.walk.to,
                false,
            );
        }
        if (right) {
            // this.mesh.rotate(Vector3.Up(), CharacterController.CROUCH_SPEED);
            this.animations.walk.start(
                true,
                this.animSpeed,
                this.animations.walk.from,
                this.animations.walk.to,
                false,
            );
        }

        if (forward || backward || left || right) {
            this.isMoving = true;
        } else {
            this.isMoving = false;
        }

        if (this.isMoving) {
            this.frontVector.set(0, 0, forward ? 1 : backward ? -1 : 0);
            this.sideVector.set(left ? 1 : right ? -1 : 0, 0, 0);

            this.moveDirection.set(
                this.frontVector.x - this.sideVector.x,
                0,
                this.frontVector.z - this.sideVector.z,
            );
            this.moveDirection.normalize();
            this.moveDirection.scaleInPlace(this.moveSpeed);

            // move according to camera's rotation
            this.moveDirection.rotateByQuaternionToRef(
                this.camera.absoluteRotation,
                this.moveDirection,
            );

            // rotate avatar with respect to camera direction.
            // this.mesh.rotation.rotateByQuaternionToRef(
            //     this.camera.absoluteRotation,
            //     this.mesh.rotation,
            // );

            console.log(this.mesh.rotation);

            this.mesh.moveWithCollisions(this.moveDirection);

            if (shift) {
                this.moveSpeed = CharacterController.CROUCH_SPEED;

                this.animations.idle.stop();
                this.animations.walk.stop();
                this.animations.crouch.stop();
                this.animations.sneakwalk.start(
                    true,
                    1.0,
                    this.animations.sneakwalk.from,
                    this.animations.sneakwalk.to,
                    false,
                );
            }
        } else {
            this.animations.walk.stop();
            this.animations.crouch.stop();
            this.animations.sneakwalk.stop();
            this.animations.idle.start(
                true,
                1.0,
                this.animations.idle.from,
                this.animations.idle.to,
                false,
            );

            if (shift) {
                this.animations.crouch.start(
                    true,
                    1.0,
                    this.animations.crouch.from,
                    this.animations.crouch.to,
                    false,
                );
            }
        }

        if (shift) {
            this.moveSpeed = CharacterController.CROUCH_SPEED;
            if (!this.isMoving) {
                this.animations.crouch.start(
                    true,
                    1.0,
                    this.animations.crouch.from,
                    this.animations.crouch.to,
                    false,
                );
            }
        } else {
            this.moveSpeed = CharacterController.WALK_SPEED;
            if (this.isMoving) {
            }
        }
    }

    private jump(): void {
        if (!this.isActive) return;
        this.mesh.applyImpulse(
            new Vector3(0, CharacterController.JUMP_FORCE, 0),
            new Vector3(0, 0, 0),
        );
        console.log("called jump");
    }

    /**
     * rotate avatar with respect to camera direction.
     */
    private rotateMeshToCamera() {
        const _rhsSign = this.camera.getScene().useRightHandedSystem ? -1 : 1;
        const av2cam = Math.PI * 0.5;
        const cameraAngle = av2cam - this.camera.alpha;
        switch (true) {
            case (this.keyStatus["w"] && this.keyStatus["d"]) ||
                (this.keyStatus["arrowup"] && this.keyStatus["arrowright"]):
                this.mesh.rotation.y = cameraAngle + (_rhsSign * Math.PI) * 0.25;
                break;
            case (this.keyStatus["w"] && this.keyStatus["a"]) ||
                (this.keyStatus["arrowup"] && this.keyStatus["arrowleft"]):
                this.mesh.rotation.y = cameraAngle - (_rhsSign * Math.PI) * 0.25;
                break;
            case (this.keyStatus["s"] && this.keyStatus["d"]) ||
                (this.keyStatus["arrowdown"] && this.keyStatus["arrowright"]):
                this.mesh.rotation.y = cameraAngle + (_rhsSign * 3 * Math.PI) * 0.25;
                break;
            case (this.keyStatus["s"] && this.keyStatus["a"]) ||
                (this.keyStatus["arrowdown"] && this.keyStatus["arrowleft"]):
                this.mesh.rotation.y = cameraAngle - (_rhsSign * 3 * Math.PI) * 0.25;
                break;
            case this.keyStatus["w"] || this.keyStatus["arrowup"]:
                this.mesh.rotation.y = cameraAngle;
                break;
            case this.keyStatus["s"] || this.keyStatus["arrowdown"]:
                this.mesh.rotation.y = cameraAngle + Math.PI;
                break;
            case this.keyStatus["d"] || this.keyStatus["arrowright"]:
                this.mesh.rotation.y = cameraAngle + (_rhsSign * Math.PI) / 2;
                break;
            case this.keyStatus["a"] || this.keyStatus["arrowleft"]:
                this.mesh.rotation.y = cameraAngle - (_rhsSign * Math.PI) / 2;
                break;
        }
        console.log(this.mesh.rotation);
    }

    private calculateDirectionOffset(): number {
        let directionOffset = 0; // s

        if (this.keyStatus["s"] || this.keyStatus["arrowdown"]) {
            if (this.keyStatus["d"] || this.keyStatus["arrowright"]) {
                directionOffset = Math.PI * 0.25; // s + d
            } else if (this.keyStatus["a"] || this.keyStatus["arrowleft"]) {
                directionOffset = -Math.PI * 0.25; // s + a
            }
        } else if (this.keyStatus["w"] || this.keyStatus["arrowup"]) {
            if (this.keyStatus["d"] || this.keyStatus["arrowright"]) {
                directionOffset = Math.PI * 0.25 + Math.PI * 0.5; // w + d
            } else if (this.keyStatus["a"] || this.keyStatus["arrowleft"]) {
                directionOffset = -Math.PI * 0.25 - Math.PI * 0.5; // w + a
            } else {
                directionOffset = Math.PI; // w
            }
        } else if (this.keyStatus["d"] || this.keyStatus["arrowright"]) {
            directionOffset = Math.PI * 0.5; // d
        } else if (this.keyStatus["a"] || this.keyStatus["arrowleft"]) {
            directionOffset = -Math.PI * 0.5; // a
        }

        return directionOffset;
    }

    public dispose(): void {
        this.stop();
    }
}

export default CharacterController;