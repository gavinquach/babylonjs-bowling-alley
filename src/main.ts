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
    PhysicsAggregate,
    PhysicsShapeType,
    SceneLoader,
    InstancedMesh,
    KeyboardEventTypes,
    Mesh,
    ArcRotateCamera,
} from "@babylonjs/core";
import "@babylonjs/loaders";

// using CDN in index.html
declare function HavokPhysics(): any;

let babylonCamera: ArcRotateCamera;

class App {
    canvas: HTMLCanvasElement;
    engine: Engine;

    constructor() {
        this.canvas = document.createElement("canvas");
        this.canvas.style.width = "100%";
        this.canvas.style.height = "100%";
        this.canvas.id = "babylonCanvas";
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
        this.CreateCamera(scene);

        const envMapTexture = CubeTexture.CreateFromPrefilteredData(
            "/env/sky.env",
            scene,
        );
        scene.environmentTexture = envMapTexture;
        scene.createDefaultSkybox(envMapTexture, true);
        scene.environmentIntensity = 0.5;

        // This creates a light, aiming 0,1,0 - to the sky (non-mesh)
        const light = new HemisphericLight("light", new Vector3(0, 1, 0), scene);

        // create gravity vector
        const gravityVector = new Vector3(0, -9.81, 0);


        const havokInstance = await HavokPhysics();
        // pass the engine to the plugin
        const havokPlugin = new HavokPlugin(true, havokInstance);
        // enable physics in the scene with a gravity
        scene.enablePhysics(gravityVector, havokPlugin);

        // Default intensity is 1. Let's dim the light a small amount
        light.intensity = 0.7;

        this.CreateBowlingAlley(scene);
        // this.CreateLane(scene);
        this.CreatePins(scene);
        this.CreateBall(scene);

        return scene;
    }

    CreateCamera(scene: Scene) {
        babylonCamera = new ArcRotateCamera(
            "camera",
            -Math.PI * 0.5,
            Math.PI * 0.5,
            5,
            Vector3.Zero(),
            scene,
        );

        babylonCamera.position = new Vector3(0, 2.5, -28);
        babylonCamera.setTarget(new Vector3(0, 2, -22));

        // This attaches the camera to the canvas
        babylonCamera.attachControl(this.canvas, true);

        // prevent clipping
        babylonCamera.minZ = 0.1;

        babylonCamera.wheelPrecision = 50;

        // camera min distance and max distance
        babylonCamera.lowerRadiusLimit = 0.1;
        babylonCamera.upperRadiusLimit = 50;

        //  lower rotation sensitivity, higher value = less sensitive
        babylonCamera.angularSensibilityX = 2000;
        babylonCamera.angularSensibilityY = 2000;

        // disable rotation using keyboard arrow key
        babylonCamera.keysUp = [];
        babylonCamera.keysDown = [];
        babylonCamera.keysLeft = [];
        babylonCamera.keysRight = [];
    }

    async CreateBowlingAlley(scene: Scene) {
        const result = await SceneLoader.ImportMeshAsync(
            "",
            "/models/",
            "bowling-alley.glb",
            scene,
        );

        result.meshes.forEach(mesh => {
            mesh.position = new Vector3(1.34, 2.1, 35);
            mesh.scaling.scaleInPlace(6);

            // lane of user, enable physics collision
            if (
                mesh.name === "polygon1.001" ||
                mesh.name === "polygon133" ||
                mesh.name === "polygon139"
            ) {
                new PhysicsAggregate(mesh, PhysicsShapeType.MESH, { mass: 0 }, scene);
            }
        });
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
            new Vector3(0, 0, 8.425),
            new Vector3(0.55, 0, 9.355),
            new Vector3(-0.55, 0, 9.355),
            new Vector3(0, 0, 10.325),
            new Vector3(1.1, 0, 10.325),
            new Vector3(-1.1, 0, 10.325),
            new Vector3(-1.65, 0, 11.285),
            new Vector3(-0.55, 0, 11.285),
            new Vector3(0.55, 0, 11.285),
            new Vector3(1.65, 0, 11.285),
        ];

        // Create instances of the bowling pin
        return pinPositions.map((positionInSpace, idx) => {
            const pin = new InstancedMesh("pin-" + idx, bowlingPin as Mesh);
            pin.position = positionInSpace;
            new PhysicsAggregate(
                pin,
                PhysicsShapeType.CONVEX_HULL,
                { mass: 1, restitution: 0.15 },
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
        bowlingBall.position = new Vector3(0, 0.5, -22);
        const ballAggregate = new PhysicsAggregate(
            bowlingBall,
            PhysicsShapeType.SPHERE,
            { mass: 4, restitution: 0.25 },
            scene,
        );
        ballAggregate.body.disablePreStep = false;

        // Create keyboard input
        scene.onKeyboardObservable.add(kbInfo => {
            switch (kbInfo.type) {
                case KeyboardEventTypes.KEYDOWN:
                    switch (kbInfo.event.key.toLowerCase().trim()) {
                        case "a":
                            if (bowlingBall.position.x > 1.8) break;
                            bowlingBall.position.x += 0.1;
                            break;
                        case "d":
                            if (bowlingBall.position.x < -1.8) break;
                            bowlingBall.position.x -= 0.1;
                            break;
                        case "arrowleft":
                            if (bowlingBall.position.x > 1.8) break;
                            bowlingBall.position.x += 0.1;
                            break;
                        case "arrowright":
                            if (bowlingBall.position.x < -1.8) break;
                            bowlingBall.position.x -= 0.1;
                            break;
                        case "":
                            ballAggregate.body.applyImpulse(
                                new Vector3(0, 0, 100),
                                bowlingBall.getAbsolutePosition(),
                            );
                            break;
                    }
            }
        });
    }
}

new App();
