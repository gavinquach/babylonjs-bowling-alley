import {
    AbstractMesh,
    AnimationGroup,
    Mesh,
    MeshBuilder,
    PhysicsAggregate,
    PhysicsBody,
    PhysicsMotionType,
    PhysicsShapeType,
    Scene,
    SceneLoader,
    Vector3,
} from "@babylonjs/core";

class Character {
    public scene: Scene;
    private _root!: AbstractMesh;
    private _meshes!: AbstractMesh[];
    private _animations: {
        [key: string]: AnimationGroup;
    } = {};
    private capsuleHeight: number = 2.5;
    private _capsuleMesh: Mesh;
    private _physicsAggregate: PhysicsAggregate;

    constructor(scene: Scene) {
        this.scene = scene;

        // create capsule physics body for character
        this._capsuleMesh = MeshBuilder.CreateCapsule(
            "sphereMesh",
            {
                radius: 0.55,
                height: this.capsuleHeight,
                tessellation: 2,
                subdivisions: 1,
            },
            this.scene,
        );
        this._capsuleMesh.isVisible = false;
        this._capsuleMesh.position = new Vector3(0, this.capsuleHeight * 0.5, 0);

        const physicsAggregate = new PhysicsAggregate(
            this._capsuleMesh,
            PhysicsShapeType.CAPSULE,
            { mass: 20, restitution: 0.01 },
            this.scene,
        );

        this._physicsAggregate = physicsAggregate;
        this._physicsAggregate.body.setMotionType(PhysicsMotionType.DYNAMIC);

        // lock rotation by disabling intertia
        this._physicsAggregate.body.setMassProperties({
            inertia: new Vector3(0, 0, 0),
        });
        // prevent sliding around
        this._physicsAggregate.body.setLinearDamping(50);
    }

    public async init(): Promise<void> {
        const { meshes, animationGroups } = await SceneLoader.ImportMeshAsync(
            "",
            "/models/",
            "character.glb",
            this.scene,
        );
        this._meshes = meshes;
        this._root = meshes[0];

        // play Idle animation
        // 0: Crouch
        // 1: Idle
        // 2: RumbaDance
        // 3: Run
        // 4: SneakWalk
        // 5: Walk
        animationGroups[1].start(
            true,
            1.0,
            animationGroups[1].from,
            animationGroups[1].to,
            false,
        );

        this._root.scaling.scaleInPlace(1.5);

        // re-center character's pivot point for physics body
        let characterHeight = 0;
        this._root.getChildMeshes().forEach(mesh => {
            if (mesh.name === "Beta_Joints.001") {
                characterHeight = mesh.getBoundingInfo().boundingBox.maximumWorld.y;
                return;
            }
        });
        this._root.setPivotPoint(new Vector3(0, characterHeight * 1.6, 0));

        this.scene.registerBeforeRender(() => {
            this._root.position.copyFrom(this._capsuleMesh.position);
        });
    }

    public get root(): AbstractMesh {
        return this._root;
    }
    public get meshes(): AbstractMesh[] {
        return this._meshes;
    }
    public get animations(): { [key: string]: AnimationGroup } {
        return this._animations;
    }
    public get physicsAggregate(): PhysicsAggregate {
        return this._physicsAggregate;
    }
    public get physicsBody(): PhysicsBody {
        return this._physicsAggregate.body;
    }

    public show(): void {
        this._meshes.forEach((mesh) => {
            mesh.isVisible = true;
        });
    }

    public hide(): void {
        this._meshes.forEach((mesh) => {
            mesh.isVisible = false;
        });

        this.physicsAggregate.body.disablePreStep = false;
        this._capsuleMesh.position = new Vector3(0, this.capsuleHeight * 0.5, 0);
        this.scene.onAfterPhysicsObservable.addOnce(() => {
            this.physicsAggregate.body.disablePreStep = true;
        });
    }

    public dispose(): void {
        // remove all meshes' animations
        Object.entries(this._animations).forEach(([_, animation]) => {
            animation.dispose();
        });

        if (!this._meshes) return;

        this._meshes.forEach(mesh => {
            this.scene.removeMesh(mesh);
            mesh.dispose(false, true);
        });

        this.scene.removeMesh(this._capsuleMesh);
        this._capsuleMesh.dispose();
    }
}

export default Character;
