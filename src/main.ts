import "./style.css";
import "@babylonjs/core/Debug/debugLayer";
import "@babylonjs/inspector";
import {
    Engine,
    Scene,
    Vector3,
    HemisphericLight,
    MeshBuilder,
    CubeTexture,
    HavokPlugin,
    FreeCamera,
    PhysicsAggregate,
    PhysicsShapeType,
    SceneLoader,
    InstancedMesh,
    KeyboardEventTypes,
    Mesh,
    ArcRotateCamera,
} from "@babylonjs/core";
import "@babylonjs/loaders";

class App {
    canvas: HTMLCanvasElement;
    engine: Engine;
    camera: ArcRotateCamera;

    constructor() {
        this.canvas = document.createElement("canvas");
        this.canvas.style.width = "100%";
        this.canvas.style.height = "100%";
        this.canvas.id = "gameCanvas";
        document.getElementById("app")!.appendChild(this.canvas);

        // initialize babylon scene and engine
        this.engine = new Engine(this.canvas, true);

        this.CreateScene().then(scene => {
            // hide/show the Inspector by pressing i
            window.addEventListener("keydown", ev => {
                if (ev.key === "i") {
                    if (scene.debugLayer.isVisible()) {
                        scene.debugLayer.hide();
                    } else {
                        scene.debugLayer.show();
                    }
                }
            });

            this.engine.runRenderLoop(() => {
                if (scene) scene.render();
            });
        });
    }

    async CreateScene(): Promise<Scene> {
        const scene = new Scene(this.engine);

        // This creates and positions a free camera (non-mesh)
        this.camera = new ArcRotateCamera(
            "camera",
            -Math.PI * 0.5,
            Math.PI * 0.5,
            5,
            Vector3.Zero(),
            scene,
        );

        this.camera.position = new Vector3(0, 3, -24);
        this.camera.setTarget(new Vector3(0, 2, -18));

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

        const envMapTexture = CubeTexture.CreateFromPrefilteredData(
            "/env/sky.env",
            scene,
        );
        scene.environmentTexture = envMapTexture;
        scene.createDefaultSkybox(envMapTexture, true);
        scene.environmentIntensity = 0.5;

        // This creates a light, aiming 0,1,0 - to the sky (non-mesh)
        const light = new HemisphericLight("light", new Vector3(0, 1, 0), scene);

        // initialize plugin
        const havokInstance = await HavokPhysics();
        // create gravity vector
        const gravityVector = new Vector3(0, -9.81, 0);
        // pass the engine to the plugin
        const havokPlugin = new HavokPlugin(true, havokInstance);
        // enable physics in the scene with a gravity
        scene.enablePhysics(gravityVector, havokPlugin);

        // Default intensity is 1. Let's dim the light a small amount
        light.intensity = 0.7;

        this.CreateLane(scene);
        this.CreatePins(scene);
        this.CreateBall(scene);

        return scene;
    }

    async CreateLane(scene: Scene) {
        const lane = MeshBuilder.CreateGround(
            "lane",
            { width: 6, height: 30 },
            scene,
        );
        lane.position = new Vector3(0, 0, -5);

        new PhysicsAggregate(lane, PhysicsShapeType.BOX, { mass: 0 }, scene);
    }

    // Create bowling pins
    async CreatePins(scene: Scene): Promise<InstancedMesh[]> {
        const result = await SceneLoader.ImportMeshAsync(
            "",
            "/models/",
            "pin.glb",
            scene,
        );

        const bowlingPin = result.meshes[1];
        bowlingPin.scaling = new Vector3(0.3, 0.3, 0.3);
        bowlingPin.setEnabled(false);

        // Pin positions
        const pinPositions = [
            new Vector3(0, 0, 5),
            new Vector3(0.5, 0, 6),
            new Vector3(-0.5, 0, 6),
            new Vector3(0, 0, 7),
            new Vector3(1, 0, 7),
            new Vector3(-1, 0, 7),
            new Vector3(-1.5, 0, 8),
            new Vector3(-0.5, 0, 8),
            new Vector3(0.5, 0, 8),
            new Vector3(1.5, 0, 8),
        ];

        // Create instances of the bowling pin
        return pinPositions.map((positionInSpace, idx) => {
            const pin = new InstancedMesh("pin-" + idx, bowlingPin as Mesh);
            pin.position = positionInSpace;
            new PhysicsAggregate(
                pin,
                PhysicsShapeType.CONVEX_HULL,
                { mass: 1, restitution: 0.25 },
                scene,
            );
            return pin;
        });
    }

    async CreateBall(scene: Scene) {
        const result = await SceneLoader.ImportMeshAsync(
            "",
            "/models/",
            "ball.glb",
            scene,
        );
        const bowlingBall = result.meshes[1];
        bowlingBall.scaling.scaleInPlace(0.7);
        bowlingBall.position = new Vector3(0, 0.5, -15);
        const ballAggregate = new PhysicsAggregate(
            bowlingBall,
            PhysicsShapeType.SPHERE,
            { mass: 1, restitution: 0.25 },
            scene,
        );
        ballAggregate.body.disablePreStep = false;

        // Create keyboard input
        scene.onKeyboardObservable.add(kbInfo => {
            switch (kbInfo.type) {
                case KeyboardEventTypes.KEYDOWN:
                    switch (kbInfo.event.key.toLowerCase()) {
                        case "a":
                            bowlingBall.position.x += 0.1;
                            break;
                        case "d":
                            bowlingBall.position.x -= 0.1;
                            break;
                        case "arrowleft":
                            bowlingBall.position.x += 0.1;
                            break;
                        case "arrowright":
                            bowlingBall.position.x -= 0.1;
                            break;
                    }
            }
        });

        const handleKeyDown = (ev: KeyboardEvent) => {
            // space key press
            if (ev.code === "Space") {
                ballAggregate.body.applyImpulse(
                    new Vector3(0, 0, 30),
                    bowlingBall.getAbsolutePosition(),
                );
            }
        };
        this.canvas.addEventListener("keydown", handleKeyDown);

        // remove event listener when scene is disposed
        scene.onDisposeObservable.add(() => {
            this.canvas.removeEventListener("keydown", handleKeyDown);
        });
    }
}

new App();
