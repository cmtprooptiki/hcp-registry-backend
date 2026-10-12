import User from "../models/UserModel.js";
import argon2 from "argon2";
 
export const Login = async(req,res)=>{
    const user = await User.findOne({
        where:{
            email:req.body.email
        }
    });
    if (!user) return res.status(404).json({msg:"User not  found"});
    const match = await argon2.verify(user.password, req.body.password);
    if (!match) return res.status(400).json({msg:"wrong password"});
    req.session.userId=user.uuid;
    const uuid=user.uuid;
    const name = user.name;
    const email = user.email;
    const role = user.role;
    const profileImage=user.profileImage;
    const id=user.id;
    res.status(200).json({uuid,name,email,role,profileImage,id});
 
}
 
export const Me = async(req,res)=>{
    if(!req.session.userId){
        return res.status(401).json({msg:"please log in to your account"});
    }
    const user = await User.findOne({
        attributes:['uuid','name','email','role','profileImage','id'],
        where:{
            uuid:req.session.userId
        }
    });
    if (!user) return res.status(404).json({msg:"User not  found"});
    res.status(200).json(user);
}
 
export const logOut = (req,res)=>{
    // cookie-session has no destroy(); clearing the session removes the cookie
    req.session = null;
    res.status(200).json({msg:"Logged out"});
}