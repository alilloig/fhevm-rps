import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy } = hre.deployments;

  const deployedFHERPS = await deploy("FHERPS", {
    from: deployer,
    log: true,
  });

  console.log(`FHERPS contract: `, deployedFHERPS.address);
};
export default func;
func.id = "deploy_fherps"; // id required to prevent reexecution
func.tags = ["FHERPS"];
