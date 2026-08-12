import earcut from "earcut";
import type { MeshShape } from "@bones/schema";
import type { ShapePart } from "./editorState";

export function createAttachmentMesh(part: ShapePart): MeshShape {
  const viewBox = part.svgViewBox;
  const width = Math.max(16, viewBox?.[2] ?? part.width ?? 120);
  const height = Math.max(16, viewBox?.[3] ?? width * 1.35);
  const left = viewBox?.[0] ?? -width * 0.5;
  const top = viewBox?.[1] ?? -height * 0.5;
  const vertices = [left, top, left + width, top, left + width, top + height, left, top + height];
  return {
    vertices,
    indices: earcut(vertices),
    uvs: [0, 0, 1, 0, 1, 1, 0, 1],
    ...(part.assetPath ? { texture: part.assetPath } : {})
  };
}

export function addMeshVertex(mesh: MeshShape): MeshShape {
  const triangle = mesh.indices.slice(0, 3);
  if (triangle.length < 3) return mesh;
  const center = triangle.reduce<[number, number]>((point, vertexIndex) => [point[0] + (mesh.vertices[vertexIndex * 2] ?? 0) / 3, point[1] + (mesh.vertices[vertexIndex * 2 + 1] ?? 0) / 3], [0, 0]);
  const newIndex = mesh.vertices.length / 2;
  const indices = [...mesh.indices.slice(3), triangle[0]!, triangle[1]!, newIndex, triangle[1]!, triangle[2]!, newIndex, triangle[2]!, triangle[0]!, newIndex];
  const uvs = mesh.uvs ? [...mesh.uvs, averageUv(mesh, triangle, 0), averageUv(mesh, triangle, 1)] : undefined;
  const skin = mesh.skin ? [...mesh.skin, []] : undefined;
  return { ...mesh, vertices: [...mesh.vertices, center[0], center[1]], indices, ...(uvs ? { uvs } : {}), ...(skin ? { skin } : {}) };
}

export function removeMeshVertex(mesh: MeshShape, vertexIndex: number): MeshShape {
  if (mesh.vertices.length <= 6 || vertexIndex < 0 || vertexIndex >= mesh.vertices.length / 2) return mesh;
  const vertices = mesh.vertices.filter((_, index) => Math.floor(index / 2) !== vertexIndex);
  const indices = mesh.indices
    .reduce<number[][]>((triangles, value, index) => {
      if (index % 3 === 0) triangles.push([]);
      triangles[triangles.length - 1]!.push(value);
      return triangles;
    }, [])
    .filter((triangle) => !triangle.includes(vertexIndex))
    .flatMap((triangle) => triangle.map((index) => index > vertexIndex ? index - 1 : index));
  const uvs = mesh.uvs?.filter((_, index) => Math.floor(index / 2) !== vertexIndex);
  const skin = mesh.skin?.filter((_, index) => index !== vertexIndex);
  return { ...mesh, vertices, indices: indices.length >= 3 ? indices : earcut(vertices), ...(uvs ? { uvs } : {}), ...(skin ? { skin } : {}) };
}

export function addMeshTriangle(mesh: MeshShape, vertexIndices: readonly number[]): MeshShape {
  if (vertexIndices.length !== 3 || new Set(vertexIndices).size !== 3 || vertexIndices.some((index) => index < 0 || index >= mesh.vertices.length / 2)) return mesh;
  return { ...mesh, indices: [...mesh.indices, ...vertexIndices] };
}

export function removeMeshTriangle(mesh: MeshShape, triangleIndex: number): MeshShape {
  if (triangleIndex < 0 || triangleIndex * 3 >= mesh.indices.length) return mesh;
  return { ...mesh, indices: mesh.indices.filter((_, index) => Math.floor(index / 3) !== triangleIndex) };
}

export function triangulateMesh(mesh: MeshShape): MeshShape {
  if (mesh.vertices.length < 6) return mesh;
  const center = mesh.vertices.reduce<[number, number]>((sum, value, index) => index % 2 === 0 ? [sum[0] + value, sum[1]] : [sum[0], sum[1] + value], [0, 0]);
  const count = mesh.vertices.length / 2;
  const order = Array.from({ length: count }, (_, index) => index).sort((left, right) => {
    const leftAngle = Math.atan2((mesh.vertices[left * 2 + 1] ?? 0) - center[1] / count, (mesh.vertices[left * 2] ?? 0) - center[0] / count);
    const rightAngle = Math.atan2((mesh.vertices[right * 2 + 1] ?? 0) - center[1] / count, (mesh.vertices[right * 2] ?? 0) - center[0] / count);
    return leftAngle - rightAngle;
  });
  const polygon = order.flatMap((index) => [mesh.vertices[index * 2] ?? 0, mesh.vertices[index * 2 + 1] ?? 0]);
  return { ...mesh, indices: earcut(polygon).map((orderedIndex) => order[orderedIndex]!) };
}

function averageUv(mesh: MeshShape, indices: readonly number[], axis: 0 | 1): number {
  if (!mesh.uvs) return 0.5;
  return indices.reduce((sum, index) => sum + (mesh.uvs![index * 2 + axis] ?? 0.5), 0) / indices.length;
}
