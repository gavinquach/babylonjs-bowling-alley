import "./style.css";
import "@babylonjs/core/Debug/debugLayer";
import "@babylonjs/inspector";
import "@babylonjs/loaders";
import * as BABYLON from "@babylonjs/core";
import { HavokPhysicsWithBindings } from "@babylonjs/havok";
import * as Hammer from "hammerjs";

import Character from "./components/Character";
import CharacterController from "./components/CharacterController";
import Joystick from "./components/Joystick";

// using CDN in index.html
declare function HavokPhysics(): any;

class App {
    public canvas: HTMLCanvasElement;
    public engine: BABYLON.Engine;
    public scene: BABYLON.Scene;
    public havok!: HavokPhysicsWithBindings;
    public camera!: BABYLON.ArcRotateCamera | BABYLON.UniversalCamera;
    public character!: Character;
    public characterController!: CharacterController;
    public thirdperson: boolean = false;
    public joystick: Joystick;
    public bowlingAlleyObjects!: {
        ground: BABYLON.Mesh;
        character: BABYLON.AbstractMesh[];
        ball: BABYLON.AbstractMesh;
        ballAggregate: BABYLON.PhysicsAggregate;
        pinMeshes: BABYLON.InstancedMesh[];
        pinAggregates: BABYLON.PhysicsAggregate[];
        facility: BABYLON.AbstractMesh[];
    };

    public gameState: 0 | 1 | 2 | 3 = 1;
    public round: number = 1;
    private isThirdperson: boolean = false;

    private pinPositions: BABYLON.Vector3[];
    private allowThrow: boolean = false;
    private throwPower: number = 100;
    private throwAngle: number = 0; // max: 5, min: -5, default: 0
    private laneStage: 0 | 1 = 0;

    constructor() {
        this.initHUD();

        this.canvas = document.createElement("canvas");
        this.canvas.style.width = "100%";
        this.canvas.style.height = "100%";
        this.canvas.id = "babylonCanvas";
        document.getElementById("app")!.appendChild(this.canvas);

        this.joystick = new Joystick();

        // initialize babylon scene and engine
        this.engine = new BABYLON.Engine(this.canvas, true);

        // show loading screen
        this.engine.displayLoadingUI();

        this.scene = new BABYLON.Scene(this.engine);

        this.pinPositions = [
            new BABYLON.Vector3(0, 0, 31.51), // 1
            new BABYLON.Vector3(0.55, 0, 32.455), // 2
            new BABYLON.Vector3(-0.55, 0, 32.455), // 3
            new BABYLON.Vector3(0, 0, 33.39), // 4
            new BABYLON.Vector3(1.1, 0, 33.39), // 5
            new BABYLON.Vector3(-1.1, 0, 33.39), // 6
            new BABYLON.Vector3(-1.65, 0, 34.35), // 7
            new BABYLON.Vector3(-0.55, 0, 34.35), // 8
            new BABYLON.Vector3(0.55, 0, 34.35), // 9
            new BABYLON.Vector3(1.65, 0, 34.35), // 10
        ];

        this.bowlingAlleyObjects = {
            ground: null!,
            ball: null!,
            ballAggregate: null!,
            character: [],
            pinMeshes: [],
            pinAggregates: [],
            facility: [],
        };

        // wait until scene has physics then create scene
        this.initScene().then(async () => {
            // this.initSceneCamera();
            await this.createBowlingAlley(this.scene);
            await this.createPins(this.scene);
            await this.createBall(this.scene);

            this.character = new Character(this.scene);
            this.initThirdPersonController();
            await this.character.init();
            this.characterController = new CharacterController(
                this.character!.root as BABYLON.Mesh,
                this.character!.physicsBody as BABYLON.PhysicsBody,
                this.camera as BABYLON.ArcRotateCamera,
                this.scene,
                this.joystick,
            );

            this.createLight();

            this.initControls();
            this.allowThrow = true;

            // hide loading screen
            this.engine.hideLoadingUI();

            this.engine.runRenderLoop(() => {
                if (this.scene) this.scene.render();
            });

            // the canvas/window resize event handler
            const handleResize = () => this.engine.resize();
            window.addEventListener("resize", handleResize);

            // remove event listener
            this.scene.onDispose = () => {
                window.removeEventListener("resize", handleResize);

                this.dispose();
            };
        });
    }

    countStandingPins(): number {
        let pinsUp = 0;
        this.bowlingAlleyObjects.pinMeshes.forEach(pin => {
            if (this.isPinUp(pin)) pinsUp++;
        });
        return pinsUp;
    }

    setLaneStage(): void {
        this.allowThrow = false;

        setTimeout(() => {
            if (this.laneStage === 0) {
                this.laneStage = 1;

                // ==========================================
                // reset ball position using ball physics body

                // turn off pre step to reposition ball
                this.bowlingAlleyObjects.ballAggregate.body.disablePreStep = false;
                this.bowlingAlleyObjects.ballAggregate.body.transformNode.position =
                    new BABYLON.Vector3(0, 0.5, 1);

                // freeze ball position and rotation
                this.bowlingAlleyObjects.ballAggregate.body.setMotionType(
                    BABYLON.PhysicsMotionType.STATIC,
                );
                // ==========================================

                // ==========================================
                // hide pins that have fallen
                this.bowlingAlleyObjects.pinMeshes.forEach((pin, meshIndex) => {
                    if (!this.isPinUp(pin)) {
                        this.bowlingAlleyObjects.pinAggregates.forEach(
                            (pinAggregate, aggIndex) => {
                                if (meshIndex === aggIndex) {
                                    // freeze pins position and rotation
                                    pinAggregate.body.setMotionType(BABYLON.PhysicsMotionType.STATIC);

                                    pinAggregate.body.disablePreStep = false;
                                    pinAggregate.body.transformNode.position.y = 1.5;

                                    // reset rotation
                                    pinAggregate.body.transformNode.rotationQuaternion =
                                        new BABYLON.Vector3(
                                            1.5650289785496072,
                                            0.8744594232768839,
                                            0.8744420168855229
                                        ).toQuaternion();

                                }
                            },
                        );
                    }
                });

                this.scene.onAfterRenderObservable.addOnce(() => {
                    // Turn disablePreStep on again for maximum performance
                    this.bowlingAlleyObjects.ballAggregate.body.disablePreStep = true;

                    // allow ball to move again
                    this.bowlingAlleyObjects.ballAggregate.body.setMotionType(
                        BABYLON.PhysicsMotionType.DYNAMIC,
                    );
                });
            } else {
                this.laneStage = 0;

                // ==========================================
                // reset ball position using ball physics body

                // turn off pre step to reposition ball
                this.bowlingAlleyObjects.ballAggregate.body.disablePreStep = false;
                this.bowlingAlleyObjects.ballAggregate.body.transformNode.position =
                    new BABYLON.Vector3(0, 0.5, 1);

                // freeze ball position and rotation
                this.bowlingAlleyObjects.ballAggregate.body.setMotionType(
                    BABYLON.PhysicsMotionType.STATIC,
                );
                // ==========================================

                // ==========================================
                // reset pins position
                this.bowlingAlleyObjects.pinAggregates.forEach(
                    (pinAggregate, aggIndex) => {
                        // freeze pins position and rotation
                        pinAggregate.body.setMotionType(BABYLON.PhysicsMotionType.STATIC);

                        // turn off disable pre step to reposition pin
                        pinAggregate.body.disablePreStep = false;

                        // reset rotation and position
                        pinAggregate.body.transformNode.rotationQuaternion =
                            new BABYLON.Vector3(
                                1.5650289785496072,
                                0.8744594232768839,
                                0.8744420168855229
                            ).toQuaternion();
                        pinAggregate.body.transformNode.position = this.pinPositions[aggIndex];

                        console.log(pinAggregate.body.transformNode.position);
                    },
                );

                this.scene.onAfterRenderObservable.addOnce(() => {
                    // Turn disablePreStep on again for maximum performance
                    this.bowlingAlleyObjects.ballAggregate.body.disablePreStep = true;

                    // allow ball to move again
                    this.bowlingAlleyObjects.ballAggregate.body.setMotionType(
                        BABYLON.PhysicsMotionType.DYNAMIC,
                    );

                    this.bowlingAlleyObjects.pinAggregates.forEach((pinAggregate) => {
                        // Turn disablePreStep on again for maximum performance
                        pinAggregate.body.disablePreStep = true;

                        // allow pin to move again
                        pinAggregate.body.setMotionType(BABYLON.PhysicsMotionType.DYNAMIC);
                    });
                });
            }

            // allow throw ball again
            this.allowThrow = true;
        }, 6000);
    }

    isPinUp(pin: BABYLON.AbstractMesh): boolean {
        // a vector3 rotation angle close to this is up (margin of 0.07)
        // x: 1.5650289785496072
        // y: 0.8744594232768839
        // z: 0.8744420168855229
        const rotation = pin.rotationQuaternion?.toEulerAngles();

        if (rotation) {
            if (
                Math.abs(rotation.x - 1.5650289785496072) < 0.07 &&
                Math.abs(rotation.y - 0.8744594232768839) < 0.07 &&
                Math.abs(rotation.z - 0.8744420168855229) < 0.07
            ) {
                return true;
            }
            return false;
        }
        return false;
    }

    initHUD(): void { }

    async initScene(): Promise<void> {
        const envMapTexture = BABYLON.CubeTexture.CreateFromPrefilteredData(
            "/envMap/sky.env",
            this.scene,
        );
        this.scene.environmentTexture = envMapTexture;
        this.scene.createDefaultSkybox(envMapTexture, true);
        this.scene.environmentIntensity = 0.5;

        // Enable physics
        const gravityVector = new BABYLON.Vector3(0, -19.62, 0);
        this.havok = await HavokPhysics();
        // pass the engine to the plugin
        const havokPlugin = new BABYLON.HavokPlugin(true, this.havok);
        // enable physics in the scene with a gravity
        this.scene.enablePhysics(gravityVector, havokPlugin);

        this.scene.collisionsEnabled = true;
    }

    initFirstPersonController(pointerLock: boolean = true): void {
        this.resetCamera();
        this.disposeCharacter();

        this.camera = new BABYLON.UniversalCamera(
            "camera",
            new BABYLON.Vector3(0, 2.5, -2),
            this.scene,
        );
        this.camera.attachControl();

        if (pointerLock) {
            this.engine.enterPointerlock();
            this.scene.onPointerDown = e => {
                // left click
                if (e.button === 0) this.engine.enterPointerlock();
            };
        } else {
            this.engine.exitPointerlock();
            this.scene.onPointerDown = undefined;
        }

        this.camera.applyGravity = true; // apply gravity to the camera
        this.camera.checkCollisions = true; // prevent walking through walls
        this.camera.ellipsoid = new BABYLON.Vector3(1, 1.25, 1); // collision box
        this.camera.speed = 1; // walking speed
        this.camera.inertia = 0.5; // reduce slipping
        this.camera.minZ = 0.1; // prevent clipping
        this.camera.angularSensibility = 1500; // mouse sensitivity: higher value = less sensitive

        this.camera.keysUp.push(87); // W
        this.camera.keysLeft.push(65); // A
        this.camera.keysDown.push(83); // S
        this.camera.keysRight.push(68); // D

        // Create invisible floor as ground to walk on with physics
        this.bowlingAlleyObjects.ground = BABYLON.MeshBuilder.CreateGround(
            "ground",
            { width: 140, height: 66 },
            this.scene,
        );
        this.bowlingAlleyObjects.ground.position.z = 2.5;
        this.bowlingAlleyObjects.ground.position.y = -0.1;
        this.bowlingAlleyObjects.ground.checkCollisions = true;
        this.bowlingAlleyObjects.ground.material = new BABYLON.StandardMaterial(
            "groundMat",
            this.scene,
        );
        this.bowlingAlleyObjects.ground.material.alpha = 0;
    }


    initThirdPersonController(): void {
        if (this.isThirdperson) return;
        this.resetCamera();

        this.camera = new BABYLON.ArcRotateCamera(
            "camera",
            -Math.PI * 0.5,
            Math.PI * 0.5,
            5,
            new BABYLON.Vector3(0, 1.15, -2), // target
            this.scene,
        );

        this.camera.position = new BABYLON.Vector3(0, 3, -6);

        // This attaches the camera to the canvas
        this.camera.attachControl(this.canvas, true);

        // prevent clipping
        this.camera.minZ = 0.1;

        this.camera.wheelPrecision = 100;

        // camera min distance and max distance
        this.camera.lowerRadiusLimit = 0.5;
        this.camera.upperRadiusLimit = 10;

        //  lower rotation sensitivity, higher value = less sensitive
        this.camera.angularSensibilityX = 2000;
        this.camera.angularSensibilityY = 2000;

        // disable rotation using keyboard arrow key
        this.camera.keysUp = [];
        this.camera.keysDown = [];
        this.camera.keysLeft = [];
        this.camera.keysRight = [];

        this.isThirdperson = true;
    }

    initSceneCamera(): void {
        this.resetCamera();

        this.camera = new BABYLON.ArcRotateCamera(
            "camera",
            -Math.PI * 0.5,
            Math.PI * 0.5,
            5,
            BABYLON.Vector3.Zero(),
            this.scene,
        );

        this.camera.position = new BABYLON.Vector3(0, 2.5, -5);
        this.camera.setTarget(new BABYLON.Vector3(0, 2, 0));

        // This attaches the camera to the canvas
        this.camera.attachControl(this.canvas, true);

        // prevent clipping
        this.camera.minZ = 0.1;

        this.camera.wheelPrecision = 50;

        // camera min distance and max distance
        this.camera.lowerRadiusLimit = 0.1;
        this.camera.upperRadiusLimit = 50;

        //  lower rotation sensitivity, higher value = less sensitive
        this.camera.angularSensibilityX = 2000;
        this.camera.angularSensibilityY = 2000;

        // disable rotation using keyboard arrow key
        this.camera.keysUp = [];
        this.camera.keysDown = [];
        this.camera.keysLeft = [];
        this.camera.keysRight = [];

        this.isThirdperson = false;
    }

    initControls(): void {
        // Keyboard input
        this.scene.onKeyboardObservable.add(async kbInfo => {
            if (kbInfo.type === BABYLON.KeyboardEventTypes.KEYDOWN) {
                switch (kbInfo.event.key.toLowerCase().trim()) {
                    case "i":
                        if (this.scene.debugLayer.isVisible()) {
                            this.scene.debugLayer.hide();
                        } else {
                            this.scene.debugLayer.show();
                        }
                        break;
                    case "1":
                        // switch to arc rotate camera by pressing 1
                        // switch to first person controller (without pointer lock) by pressing 2
                        this.stopCharacterController();
                        this.character?.hide();
                        this.initSceneCamera();
                        break;
                    case "2":
                        if (this.isThirdperson) return;
                        // switch to third person controller by pressing 3
                        this.initThirdPersonController();

                        if (!this.character) {
                            await this.initCharacterAsync();
                        } else {
                            this.character.show();
                        }

                        if (!this.characterController) {
                            this.characterController = new CharacterController(
                                this.character!.root as BABYLON.Mesh,
                                this.character!.physicsBody as BABYLON.PhysicsBody,
                                this.camera as BABYLON.ArcRotateCamera,
                                this.scene,
                                this.joystick,
                            );
                        } else {
                            this.characterController.start();
                        }
                        break;
                    case "":
                        if (!this.allowThrow) return;
                        this.bowlingAlleyObjects.ballAggregate.body.applyImpulse(
                            new BABYLON.Vector3(this.throwAngle, 0, this.throwPower),
                            this.bowlingAlleyObjects.ball.getAbsolutePosition(),
                        );
                        this.setLaneStage();
                        break;
                    case "w":
                    case "arrowup":
                        if (!this.allowThrow) return;
                        this.throwAngle += this.throwAngle >= 5 ? 0 : 0.5;
                        this.bowlingAlleyObjects.ballAggregate.body.disablePreStep = false;
                        this.bowlingAlleyObjects.ball.rotate(
                            BABYLON.Vector3.Up(),
                            -Math.PI * 0.01,
                        );
                        this.scene.onAfterRenderObservable.addOnce(() => {
                            // Turn disablePreStep on again for maximum performance
                            this.bowlingAlleyObjects.ballAggregate.body.disablePreStep = true;
                        });
                        break;
                    case "s":
                    case "arrowdown":
                        if (!this.allowThrow) return;
                        this.throwAngle -= this.throwAngle <= -5 ? 0 : 0.5;
                        this.bowlingAlleyObjects.ballAggregate.body.disablePreStep = false;
                        this.bowlingAlleyObjects.ball.rotate(
                            BABYLON.Vector3.Up(),
                            Math.PI * 0.01,
                        );
                        this.scene.onAfterRenderObservable.addOnce(() => {
                            // Turn disablePreStep on again for maximum performance
                            this.bowlingAlleyObjects.ballAggregate.body.disablePreStep = true;
                        });
                        break;
                    case "a":
                    case "arrowleft":
                        if (!this.allowThrow) return;
                        if (this.bowlingAlleyObjects.ball.position.x > 1.8) break;
                        this.bowlingAlleyObjects.ball.position.x += 0.05;
                        break;
                    case "d":
                    case "arrowright":
                        if (!this.allowThrow) return;
                        if (this.bowlingAlleyObjects.ball.position.x < -1.8) break;
                        this.bowlingAlleyObjects.ball.position.x -= 0.05;
                        break;
                }
            }
        });

        // phone input for ball
        const hammerManager = new Hammer.Manager(this.canvas);

        // create swipe gesture recognizer and add recognizer to manager
        const Swipe = new Hammer.Swipe();
        hammerManager.add(Swipe);

        hammerManager.get("swipe").set({ direction: Hammer.DIRECTION_ALL });
        hammerManager.on("swipe", (e: any) => {
            if (!this.allowThrow) return;
            switch (e.direction) {
                // swipe up to throw ball
                case Hammer.DIRECTION_UP:
                    this.bowlingAlleyObjects.ballAggregate.body.applyImpulse(
                        new BABYLON.Vector3(this.throwAngle, 0, this.throwPower),
                        this.bowlingAlleyObjects.ball.getAbsolutePosition(),
                    );
                    this.setLaneStage();
                    break;
                case Hammer.DIRECTION_LEFT:
                    if (this.bowlingAlleyObjects.ball.position.x > 1.8) break;
                    this.bowlingAlleyObjects.ball.position.x += 0.05;
                    break;
                case Hammer.DIRECTION_RIGHT:
                    if (this.bowlingAlleyObjects.ball.position.x < -1.8) break;
                    this.bowlingAlleyObjects.ball.position.x -= 0.05;
                    break;
            }
        });
    }

    createLight(): void {
        // This creates a light, aiming 0,1,0 - to the sky (non-mesh)
        const hemiLight = new BABYLON.HemisphericLight(
            "hemiLight",
            new BABYLON.Vector3(0, 1, 0),
            this.scene,
        );

        // dim light a small amount
        hemiLight.intensity = 0.7;

        const dirLight = new BABYLON.DirectionalLight(
            "dirLight",
            new BABYLON.Vector3(-0.5, -1, -0.5),
            this.scene,
        );

        dirLight.position = new BABYLON.Vector3(30, 20, -10);
        dirLight.intensity = 2.5;
        dirLight.shadowEnabled = true;
        dirLight.shadowMinZ = 10;
        dirLight.shadowMaxZ = 60;

        // this.createLightGizmo(dirLight);

        // Shadows
        const shadowGenerator = new BABYLON.ShadowGenerator(2048, dirLight);
        shadowGenerator.bias = 0.01;

        // enable PCF shadows for WebGL2
        shadowGenerator.usePercentageCloserFiltering = true;
        shadowGenerator.blurScale = 0.1;

        // low quality for better performance
        // shadowGenerator.filteringQuality = ShadowGenerator.QUALITY_LOW;

        this.character?.meshes.forEach(mesh => {
            mesh.receiveShadows = true;
            shadowGenerator.addShadowCaster(mesh);
        });

        this.bowlingAlleyObjects.ball.receiveShadows = true;
        shadowGenerator.addShadowCaster(this.bowlingAlleyObjects.ball);

        this.bowlingAlleyObjects.pinMeshes.forEach(mesh => {
            mesh.receiveShadows = true;
            shadowGenerator.addShadowCaster(mesh);
        });
        this.bowlingAlleyObjects.facility.forEach(mesh => {
            mesh.receiveShadows = true;
            shadowGenerator.addShadowCaster(mesh);
        });
    }

    createLightGizmo(customLight: BABYLON.Light): void {
        const lightGizmo = new BABYLON.LightGizmo();
        lightGizmo.scaleRatio = 2;
        lightGizmo.light = customLight;

        const gizmoManager = new BABYLON.GizmoManager(this.scene);
        gizmoManager.positionGizmoEnabled = true;
        gizmoManager.rotationGizmoEnabled = true;
        gizmoManager.usePointerToAttachGizmos = false;
        gizmoManager.attachToMesh(lightGizmo.attachedMesh);
    }

    async createBowlingAlley(scene: BABYLON.Scene): Promise<void> {
        const { meshes } = await BABYLON.SceneLoader.ImportMeshAsync(
            "",
            "/models/",
            "bowling-alley.glb",
            scene,
        );

        meshes.forEach(mesh => {
            mesh.scaling.scaleInPlace(6);
            mesh.position = new BABYLON.Vector3(1.34, 3.38, 58);

            // lane of user, enable physics collision
            // if (
            //     mesh.name === "polygon1.001" ||
            //     mesh.name === "polygon133" ||
            //     mesh.name === "polygon139"
            // ) {
            if (mesh.id !== "__root__" && mesh.name !== "polygon31") {
                new BABYLON.PhysicsAggregate(
                    mesh,
                    BABYLON.PhysicsShapeType.MESH,
                    { mass: 0 },
                    scene,
                );
            }
            // }
        });

        this.bowlingAlleyObjects.facility = meshes;
    }

    async createPins(scene: BABYLON.Scene): Promise<void> {
        const { meshes } = await BABYLON.SceneLoader.ImportMeshAsync(
            "",
            "/models/",
            "pin.glb",
            scene,
        );

        const bowlingPin = meshes[1];
        bowlingPin.scaling = new BABYLON.Vector3(0.3, 0.3, 0.3);
        bowlingPin.setEnabled(false);

        // Create instances of the bowling pin
        this.pinPositions.forEach((positionInSpace, idx) => {
            const pin = new BABYLON.InstancedMesh(
                "pin-" + idx,
                bowlingPin as BABYLON.Mesh,
            );
            pin.position = positionInSpace;

            this.bowlingAlleyObjects.pinMeshes.push(pin);

            const pinAggregate = new BABYLON.PhysicsAggregate(
                pin,
                BABYLON.PhysicsShapeType.CONVEX_HULL,
                { mass: 1, restitution: 0.15 },
                scene,
            );

            this.bowlingAlleyObjects.pinAggregates.push(pinAggregate);

            return pin;
        });
    }

    async createBall(scene: BABYLON.Scene): Promise<void> {
        const result = await BABYLON.SceneLoader.ImportMeshAsync(
            "",
            "/models/",
            "ball.glb",
            scene,
        );

        const bowlingBall = result.meshes[1];
        bowlingBall.scaling.scaleInPlace(0.7);
        bowlingBall.position = new BABYLON.Vector3(0, 0.5, 1);

        this.bowlingAlleyObjects.ball = bowlingBall;

        const ballAggregate = new BABYLON.PhysicsAggregate(
            bowlingBall,
            BABYLON.PhysicsShapeType.SPHERE,
            { mass: 4, restitution: 0.25 },
            scene,
        );
        this.bowlingAlleyObjects.ballAggregate = ballAggregate;

        // this.bowlingAlleyObjects.ballAggregate.body.disablePreStep = false;
        // // Turn disablePreStep on again for maximum performance
        // scene.onAfterRenderObservable.addOnce(() => {
        //     this.bowlingAlleyObjects.ballAggregate.body.disablePreStep = true;
        // });
    }

    resetCamera(): void {
        this.scene.removeCamera(this.camera);
        if (this.camera instanceof BABYLON.ArcRotateCamera) {
            this.camera.dispose();
        }

        this.engine.exitPointerlock();
        this.scene.onPointerDown = undefined;

        this.thirdperson = false;

        if (this.bowlingAlleyObjects.ground !== null) {
            this.scene.removeMesh(this.bowlingAlleyObjects.ground);
            this.scene.removeMaterial(this.bowlingAlleyObjects.ground.material!);
            this.bowlingAlleyObjects.ground.material!.dispose();
            this.bowlingAlleyObjects.ground.dispose();

            this.bowlingAlleyObjects.ground = null!;
        }
    }

    initCharacter(): void {
        if (this.character) return;
        this.character = new Character(this.scene);
        this.character.init();
    }

    async initCharacterAsync(): Promise<void> {
        if (this.character) return;
        this.character = new Character(this.scene);
        await this.character.init();
    }

    disposeCharacter(): void {
        this.character?.dispose();
        this.character = null!;
    }

    stopCharacterController(): void {
        this.characterController?.dispose();
        this.characterController = null!;
    }

    dispose(): void {
        // dispose cameras
        this.scene.cameras.forEach(camera => {
            camera.dispose();
        });

        // dispose character and character controller
        this.disposeCharacter();
        this.stopCharacterController();
        this.joystick.dispose();

        this.engine.stopRenderLoop();
        this.scene.dispose();
        this.engine.dispose();
    }
}

new App();
